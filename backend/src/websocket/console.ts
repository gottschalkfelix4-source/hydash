import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Dockerode from 'dockerode';
import { verifyToken } from '../middleware/auth';
import { JwtPayload } from '../types';
import logger from '../utils/logger';

const docker = new Dockerode({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

interface ConsoleConnection {
  ws: WebSocket;
  serverId: string;
  userId: string;
}

const connections = new Map<string, ConsoleConnection[]>();

// Active log streams per serverId
const logStreams = new Map<string, {
  stream: NodeJS.ReadableStream & { destroy?: () => void };
}>();

export function initWebSocket(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/console' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const serverId = url.searchParams.get('serverId');

    if (!token || !serverId) {
      ws.close(4001, 'Missing token or serverId');
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      ws.close(4002, 'Invalid token');
      return;
    }

    const connection: ConsoleConnection = {
      ws,
      serverId,
      userId: payload.userId,
    };

    // Track connection
    if (!connections.has(serverId)) {
      connections.set(serverId, []);
    }
    connections.get(serverId)!.push(connection);

    logger.info(`WebSocket connected: user=${payload.userId}, server=${serverId}`);

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'status',
      data: 'connected',
      timestamp: new Date().toISOString(),
    }));

    // Send recent logs and start live streaming
    sendRecentLogs(serverId).catch(() => {});
    startLogStreaming(serverId);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'command') {
          handleConsoleCommand(serverId, message.command, payload);
        }
      } catch (error) {
        logger.error('WebSocket message parse error:', error);
      }
    });

    ws.on('close', () => {
      const serverConnections = connections.get(serverId);
      if (serverConnections) {
        const idx = serverConnections.indexOf(connection);
        if (idx > -1) serverConnections.splice(idx, 1);
        if (serverConnections.length === 0) {
          connections.delete(serverId);
          stopLogStreaming(serverId);
        }
      }
      logger.info(`WebSocket disconnected: user=${payload.userId}, server=${serverId}`);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error:', error);
    });
  });

  return wss;
}

/**
 * Broadcast a log message to all connected clients for a server
 */
export function broadcastLog(serverId: string, level: string, message: string): void {
  const serverConnections = connections.get(serverId);
  if (!serverConnections) return;

  const data = JSON.stringify({
    type: 'log',
    data: message,
    level,
    timestamp: new Date().toISOString(),
  });

  for (const conn of serverConnections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(data);
    }
  }
}

/**
 * Send the last N lines of logs from the container to connected clients
 */
async function sendRecentLogs(serverId: string): Promise<void> {
  try {
    const containerId = await getContainerId(serverId);
    if (!containerId) return;

    const { dockerManager } = await import('../utils/docker');
    const logs = await dockerManager.getContainerLogs(containerId, 200);

    for (const line of logs) {
      broadcastLog(serverId, 'INFO', line);
    }
  } catch (error) {
    logger.error('Failed to send recent logs:', error);
  }
}

/**
 * Start live streaming logs from the Docker container.
 * Only one stream per serverId; reuses if already active.
 */
function startLogStreaming(serverId: string): void {
  if (logStreams.has(serverId)) return; // already streaming

  getContainerId(serverId).then(containerId => {
    if (!containerId) return;

    const container = docker.getContainer(containerId);

    container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      tail: 0,
      timestamps: false,
    }, (err, stream) => {
      if (err || !stream) {
        logger.error(`Failed to start log stream for ${serverId}:`, err);
        return;
      }

      logStreams.set(serverId, { stream });

      // Parse Docker log stream frames (8-byte header per frame)
      let buffer = Buffer.alloc(0);

      stream.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 8) {
          const streamType = buffer[0]; // 1=stdout, 2=stderr
          const length = buffer.readUInt32BE(4);

          if (buffer.length < 8 + length) break; // incomplete frame

          const payload = buffer.toString('utf-8', 8, 8 + length).trim();
          buffer = buffer.subarray(8 + length);

          if (payload) {
            const level = streamType === 2 ? 'ERROR' : 'INFO';
            broadcastLog(serverId, level, payload);
          }
        }
      });

      stream.on('end', () => {
        logStreams.delete(serverId);
        logger.info(`Log stream ended for server ${serverId}`);
      });

      stream.on('error', (streamErr) => {
        logger.error(`Log stream error for server ${serverId}:`, streamErr);
        logStreams.delete(serverId);
      });
    });
  }).catch(err => {
    logger.error(`Failed to start log streaming for ${serverId}:`, err);
  });
}

/**
 * Stop the live log stream for a server
 */
function stopLogStreaming(serverId: string): void {
  const entry = logStreams.get(serverId);
  if (entry) {
    entry.stream.destroy?.();
    logStreams.delete(serverId);
    logger.info(`Stopped log stream for server ${serverId}`);
  }
}

/**
 * Get the container ID for a server from the database
 */
async function getContainerId(serverId: string): Promise<string | null> {
  try {
    const { getOne } = await import('../models/db');
    const server = await getOne<{ containerId: string; status: string }>(
      'SELECT container_id, status FROM servers WHERE id = $1',
      [serverId]
    );
    return (server?.containerId && server.status === 'running') ? server.containerId : null;
  } catch {
    return null;
  }
}

/**
 * Handle a console command from a WebSocket client.
 * Writes the command to PID 1's stdin via /proc/1/fd/0 using docker exec.
 * Requires containers created with OpenStdin: true (so stdin is a pipe, not /dev/null).
 */
async function handleConsoleCommand(serverId: string, command: string, payload: JwtPayload): Promise<void> {
  logger.info(`Console command from user ${payload.userId} on server ${serverId}: ${command}`);

  const containerId = await getContainerId(serverId);
  if (!containerId) {
    broadcastLog(serverId, 'ERROR', 'Server is not running');
    return;
  }

  try {
    const container = docker.getContainer(containerId);

    // Sanitize command - allow typical game server commands
    const sanitized = command.replace(/[^a-zA-Z0-9 _\-./:=!@#$%^&*()+\[\]{}|;?',]/g, '');

    // Write command to PID 1's stdin via /proc/1/fd/0
    // This works because containers are created with OpenStdin: true,
    // so stdin is a pipe rather than /dev/null.
    const exec = await container.exec({
      Cmd: ['sh', '-c', 'printf "%s\\n" "$0" > /proc/1/fd/0', sanitized],
      AttachStdout: true,
      AttachStderr: true,
    });

    const execStream = await exec.start({ hijack: true, stdin: false });

    await new Promise<void>((resolve) => {
      execStream.on('end', () => resolve());
      execStream.on('error', () => resolve());
      setTimeout(() => resolve(), 3000);
    });
  } catch (error) {
    logger.error('Console command error:', error);
    broadcastLog(serverId, 'ERROR', 'Failed to execute command');
  }
}

/**
 * Start streaming logs from a Docker container (legacy API)
 */
export async function startLogStreamingLegacy(serverId: string, containerId: string): Promise<void> {
  try {
    const { dockerManager } = await import('../utils/docker');
    const logs = await dockerManager.getContainerLogs(containerId, 500);

    for (const line of logs) {
      broadcastLog(serverId, 'INFO', line);
    }
  } catch (error) {
    logger.error('Log streaming error:', error);
  }
}