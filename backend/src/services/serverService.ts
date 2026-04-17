import { query, getOne, getMany } from '../models/db';
import { Server, ServerStatus, createServerSchema, updateServerSchema, HytaleConfig } from '../types';
import { dockerManager } from '../utils/docker';
import { cacheDel, RedisKeys } from '../models/redis';
import logger from '../utils/logger';

/**
 * Create a new server
 */
export async function createServer(userId: string, data: Record<string, unknown>): Promise<Server> {
  const validated = createServerSchema.parse(data);

  // Check server limit
  const settings = await getOne<{ max_servers_per_user: number }>(
    'SELECT max_servers_per_user FROM app_settings WHERE id = 1'
  );
  const maxServers = settings?.max_servers_per_user || 5;

  const currentCount = await getOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM servers WHERE owner_id = $1',
    [userId]
  );

  if (parseInt(currentCount?.count || '0') >= maxServers) {
    throw new Error(`Server limit reached (max ${maxServers})`);
  }

  // Check port availability
  const portInUse = await getOne<{ id: string }>(
    'SELECT id FROM servers WHERE port = $1 AND status != $2',
    [validated.port, 'stopped']
  );
  if (portInUse) {
    throw new Error(`Port ${validated.port} is already in use`);
  }

  // Insert server into database
  const result = await query<Server>(
    `INSERT INTO servers (name, owner_id, port, memory_limit_mb, cpu_quota_micro, view_distance, tags, autostart, jvm_args, server_args)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      validated.name,
      userId,
      validated.port,
      validated.memoryLimitMb,
      validated.cpuQuotaMicro,
      validated.viewDistance,
      validated.tags,
      validated.autostart,
      validated.jvmArgs,
      validated.serverArgs,
    ]
  );

  const server = result.rows[0];

  // Add owner as server member
  await query(
    `INSERT INTO server_users (server_id, user_id, role) VALUES ($1, $2, 'owner')`,
    [server.id, userId]
  );

  logger.info(`Server created: ${server.name} (${server.id})`);
  return server;
}

/**
 * Get a server by ID
 */
export async function getServer(serverId: string): Promise<Server | null> {
  return getOne<Server>('SELECT * FROM servers WHERE id = $1', [serverId]);
}

/**
 * List servers for a user (or all servers for admin)
 */
export async function listServers(userId: string, roles: string[]): Promise<Server[]> {
  if (roles.includes('admin')) {
    return getMany<Server>('SELECT * FROM servers ORDER BY created_at DESC');
  }
  return getMany<Server>(
    `SELECT s.* FROM servers s
     LEFT JOIN server_users su ON s.id = su.server_id
     WHERE s.owner_id = $1 OR su.user_id = $1
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    [userId]
  );
}

/**
 * Update a server
 */
export async function updateServer(serverId: string, data: Partial<Server>): Promise<Server> {
  const validated = updateServerSchema.parse(data);
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fields: Record<string, unknown> = {
    name: validated.name,
    memory_limit_mb: validated.memoryLimitMb,
    cpu_quota_micro: validated.cpuQuotaMicro,
    view_distance: validated.viewDistance,
    tags: validated.tags,
    autostart: validated.autostart,
    jvm_args: validated.jvmArgs,
    server_args: validated.serverArgs,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) return server;

  values.push(serverId);
  const result = await query<Server>(
    `UPDATE servers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  // Clear cached server status
  try { await cacheDel(RedisKeys.serverStatus(serverId)); } catch {}

  return result.rows[0];
}

/**
 * Start a server
 */
export async function startServer(serverId: string): Promise<Server> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');
  if (server.status === 'running') throw new Error('Server is already running');

  try {
    // Update status to starting
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['starting', serverId]);

    let containerId = server.containerId;

    // Check if the referenced container actually exists
    if (containerId) {
      try {
        await dockerManager.inspectContainer(containerId);
      } catch {
        logger.info(`Container ${containerId} no longer exists, will create a new one`);
        containerId = null;
        await query('UPDATE servers SET container_id = NULL WHERE id = $1', [serverId]);
      }
    }

    // Check if container is in a restart loop (crash loop) - remove and recreate
    if (containerId) {
      try {
        const info = await dockerManager.inspectContainer(containerId);
        const state = info.State;
        if (state.Restarting || (state.Status === 'exited' && state.ExitCode !== 0)) {
          logger.info(`Container ${containerId} in bad state (restarting=${state.Restarting}, exitCode=${state.ExitCode}), removing and recreating`);
          try { await dockerManager.removeContainer(containerId, true); } catch {}
          containerId = null;
          await query('UPDATE servers SET container_id = NULL WHERE id = $1', [serverId]);
        }
      } catch {
        // If inspect fails, we'll create a new container below
        containerId = null;
      }
    }

    // Create container if it doesn't exist
    if (!containerId) {
      containerId = await dockerManager.createContainer({
        name: server.name,
        port: server.port,
        memoryLimitMb: server.memoryLimitMb,
        cpuQuotaMicro: server.cpuQuotaMicro,
        jvmArgs: server.jvmArgs,
        serverArgs: server.serverArgs,
        serverId: server.id,
      });
      await query('UPDATE servers SET container_id = $1 WHERE id = $2', [containerId, serverId]);
    }

    // Start the container
    await dockerManager.startContainer(containerId);

    // Update status to running
    const result = await query<Server>(
      'UPDATE servers SET status = $1, container_id = $2 WHERE id = $3 RETURNING *',
      ['running', containerId, serverId]
    );

    logger.info(`Server started: ${server.name} (${serverId})`);
    return result.rows[0];
  } catch (error) {
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['error', serverId]);
    logger.error(`Failed to start server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Stop a server
 */
export async function stopServer(serverId: string): Promise<Server> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');
  if (server.status === 'stopped') throw new Error('Server is already stopped');
  if (!server.containerId) throw new Error('Server has no container');

  try {
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['stopping', serverId]);
    await dockerManager.stopContainer(server.containerId, 30);

    const result = await query<Server>(
      'UPDATE servers SET status = $1 WHERE id = $2 RETURNING *',
      ['stopped', serverId]
    );

    logger.info(`Server stopped: ${server.name} (${serverId})`);
    return result.rows[0];
  } catch (error) {
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['error', serverId]);
    logger.error(`Failed to stop server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Restart a server
 */
export async function restartServer(serverId: string): Promise<Server> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');
  if (!server.containerId) throw new Error('Server has no container');

  try {
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['stopping', serverId]);
    await dockerManager.restartContainer(server.containerId, 30);

    const result = await query<Server>(
      'UPDATE servers SET status = $1 WHERE id = $2 RETURNING *',
      ['running', serverId]
    );

    logger.info(`Server restarted: ${server.name} (${serverId})`);
    return result.rows[0];
  } catch (error) {
    await query('UPDATE servers SET status = $1 WHERE id = $2', ['error', serverId]);
    logger.error(`Failed to restart server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Delete a server (stop container, remove container, delete from DB)
 */
export async function deleteServer(serverId: string): Promise<void> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');

  // Stop and remove container if it exists
  if (server.containerId) {
    try {
      await dockerManager.stopContainer(server.containerId, 10);
    } catch {
      // Ignore if already stopped
    }
    try {
      await dockerManager.removeContainer(server.containerId, true);
    } catch {
      // Ignore if already removed
    }
  }

  // Delete from database (cascades to server_users, mods, backups, etc.)
  await query('DELETE FROM servers WHERE id = $1', [serverId]);

  // Clear caches
  try { await cacheDel(RedisKeys.serverStatus(serverId)); } catch {}
  try { await cacheDel(RedisKeys.serverMetrics(serverId)); } catch {}

  logger.info(`Server deleted: ${server.name} (${serverId})`);
}

/**
 * Get server config.json (Hytale format)
 */
export async function getServerConfig(serverId: string): Promise<HytaleConfig | null> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');

  return server.config ? ((server.config as unknown) as HytaleConfig) : null;
}

/**
 * Update server config.json
 */
export async function updateServerConfig(serverId: string, config: Partial<HytaleConfig>): Promise<HytaleConfig> {
  const server = await getServer(serverId);
  if (!server) throw new Error('Server not found');

  const currentConfig = ((server.config || {}) as unknown) as HytaleConfig;
  const newConfig = { ...currentConfig, ...config };

  await query('UPDATE servers SET config = $1 WHERE id = $2', [JSON.stringify(newConfig), serverId]);

  // TODO: Write config.json to server data directory
  // This requires file system access via docker exec or volume mount

  return newConfig;
}

/**
 * Auto-start servers on panel boot
 */
export async function autostartServers(): Promise<void> {
  const servers = await getMany<Server>(
    "SELECT * FROM servers WHERE autostart = true AND status = 'running'"
  );

  logger.info(`Auto-starting ${servers.length} servers...`);

  for (const server of servers) {
    try {
      await startServer(server.id);
    } catch (error) {
      logger.error(`Failed to auto-start server ${server.name}:`, error);
    }
  }
}