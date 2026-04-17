import { query, getOne, getMany } from '../models/db';
import { MetricsSnapshot, HealthAnalysis, HealthIssue } from '../types';
import { dockerManager } from '../utils/docker';
import { cacheSet, cacheGetOrSet } from '../models/redis';
import { RedisKeys } from '../models/redis';
import logger from '../utils/logger';

/**
 * Collect current metrics for a server
 */
export async function collectMetrics(serverId: string): Promise<MetricsSnapshot | null> {
  const server = await getOne<{ containerId: string; status: string; memoryLimitMb: number }>(
    'SELECT container_id, status, memory_limit_mb FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server || !server.containerId || server.status !== 'running') {
    return null;
  }

  try {
    const stats = await dockerManager.getContainerStats(server.containerId);

    const snapshot: MetricsSnapshot = {
      serverId,
      cpuPercent: stats.cpuPercent,
      memoryUsedMb: stats.memoryUsage / (1024 * 1024),
      memoryLimitMb: stats.memoryLimit / (1024 * 1024),
      networkRxBytes: stats.networkRx,
      networkTxBytes: stats.networkTx,
      jvmHeapUsedMb: null,
      jvmGcCount: null,
      jvmGcTimeMs: null,
      playerCount: null,
      maxPlayers: null,
      timestamp: new Date(),
    };

    // Try to parse JVM metrics from logs
    const jvmMetrics = await parseJvmMetrics(server.containerId);
    if (jvmMetrics) {
      snapshot.jvmHeapUsedMb = jvmMetrics.heapUsedMb;
      snapshot.jvmGcCount = jvmMetrics.gcCount;
      snapshot.jvmGcTimeMs = jvmMetrics.gcTimeMs;
    }

    // Parse player count from server logs
    const playerInfo = await parsePlayerCount(server.containerId);
    if (playerInfo) {
      snapshot.playerCount = playerInfo.online;
      snapshot.maxPlayers = playerInfo.max;
    }

    // Store in Redis (30 second TTL for live data)
    await cacheSet(RedisKeys.serverMetrics(serverId), snapshot, 30);

    // Store in PostgreSQL for history
    await query(
      `INSERT INTO metrics_history (server_id, cpu_percent, memory_used_mb, memory_limit_mb, network_rx_bytes, network_tx_bytes, jvm_heap_used_mb, jvm_gc_count, jvm_gc_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        snapshot.serverId,
        snapshot.cpuPercent,
        snapshot.memoryUsedMb,
        snapshot.memoryLimitMb,
        snapshot.networkRxBytes,
        snapshot.networkTxBytes,
        snapshot.jvmHeapUsedMb,
        snapshot.jvmGcCount,
        snapshot.jvmGcTimeMs,
      ]
    );

    return snapshot;
  } catch (error) {
    logger.error(`Failed to collect metrics for server ${serverId}:`, error);
    return null;
  }
}

/**
 * Get current cached metrics for a server
 */
export async function getCurrentMetrics(serverId: string): Promise<MetricsSnapshot | null> {
  try {
    return await cacheGetOrSet<MetricsSnapshot>(
      RedisKeys.serverMetrics(serverId),
      async () => {
        const snapshot = await collectMetrics(serverId);
        return snapshot || {} as MetricsSnapshot;
      },
      30
    );
  } catch {
    return null;
  }
}

/**
 * Get historical metrics for a server
 */
export async function getMetricsHistory(serverId: string, hours: number = 24): Promise<MetricsSnapshot[]> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return getMany<MetricsSnapshot>(
    `SELECT * FROM metrics_history
     WHERE server_id = $1 AND timestamp >= $2
     ORDER BY timestamp ASC`,
    [serverId, cutoff]
  );
}

/**
 * Analyze server health based on logs and metrics
 */
export async function analyzeHealth(serverId: string): Promise<HealthAnalysis> {
  const issues: HealthIssue[] = [];

  // Get recent metrics
  const metrics = await getCurrentMetrics(serverId);
  if (metrics) {
    // High CPU warning
    if (metrics.cpuPercent > 90) {
      issues.push({
        type: 'high_cpu',
        severity: 'critical',
        message: `CPU usage at ${metrics.cpuPercent.toFixed(1)}%`,
        detectedAt: new Date(),
      });
    } else if (metrics.cpuPercent > 70) {
      issues.push({
        type: 'high_cpu',
        severity: 'warning',
        message: `CPU usage at ${metrics.cpuPercent.toFixed(1)}%`,
        detectedAt: new Date(),
      });
    }

    // High memory warning
    if (metrics.memoryLimitMb > 0) {
      const memPercent = (metrics.memoryUsedMb / metrics.memoryLimitMb) * 100;
      if (memPercent > 90) {
        issues.push({
          type: 'high_memory',
          severity: 'critical',
          message: `Memory usage at ${memPercent.toFixed(1)}% (${metrics.memoryUsedMb.toFixed(0)}/${metrics.memoryLimitMb.toFixed(0)} MB)`,
          detectedAt: new Date(),
        });
      } else if (memPercent > 70) {
        issues.push({
          type: 'high_memory',
          severity: 'warning',
          message: `Memory usage at ${memPercent.toFixed(1)}%`,
          detectedAt: new Date(),
        });
      }
    }
  }

  // Check server logs for errors
  const server = await getOne<{ containerId: string; status: string }>(
    'SELECT container_id, status FROM servers WHERE id = $1',
    [serverId]
  );

  if (server?.containerId && server.status === 'running') {
    try {
      const logs = await dockerManager.getContainerLogs(server.containerId, 100);
      const recentLogs = logs.slice(-100).join('\n');

      // Crash detection
      if (recentLogs.includes('OutOfMemoryError') || recentLogs.includes('OOM')) {
        issues.push({
          type: 'oom',
          severity: 'critical',
          message: 'Out of memory error detected in server logs',
          detectedAt: new Date(),
        });
      }

      // Lag spike detection
      if (recentLogs.includes("Can't keep up!") || recentLogs.includes('tick took')) {
        issues.push({
          type: 'lag',
          severity: 'warning',
          message: 'Lag spikes detected in server logs',
          detectedAt: new Date(),
        });
      }

      // Connection issues
      if (recentLogs.includes('disconnected') && recentLogs.split('disconnected').length > 5) {
        issues.push({
          type: 'disconnections',
          severity: 'warning',
          message: 'Multiple player disconnections detected',
          detectedAt: new Date(),
        });
      }

      // PerformanceSaver detection
      if (recentLogs.includes('PerformanceSaver')) {
        issues.push({
          type: 'performance_saver',
          severity: 'info',
          message: 'PerformanceSaver plugin detected - dynamically adjusting view distance',
          detectedAt: new Date(),
        });
      }

      // Prometheus exporter detection
      if (recentLogs.includes('PrometheusExporter')) {
        issues.push({
          type: 'prometheus',
          severity: 'info',
          message: 'Prometheus metrics exporter is active',
          detectedAt: new Date(),
        });
      }
    } catch {
      // Log analysis is non-critical
    }
  }

  // Determine overall health status
  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasWarning = issues.some(i => i.severity === 'warning');
  const status: 'healthy' | 'warning' | 'critical' = hasCritical ? 'critical' : hasWarning ? 'warning' : 'healthy';

  return {
    serverId,
    status,
    issues,
    lastChecked: new Date(),
  };
}

/**
 * Parse JVM metrics from container logs
 */
async function parseJvmMetrics(containerId: string): Promise<{
  heapUsedMb: number;
  gcCount: number;
  gcTimeMs: number;
} | null> {
  try {
    const logs = await dockerManager.getContainerLogs(containerId, 50);
    const recentLogs = logs.slice(-20).join('\n');

    // Parse heap usage
    const heapMatch = recentLogs.match(/Heap:\s+(\d+)M.*used\s+(\d+)M/);
    const heapUsedMb = heapMatch ? parseInt(heapMatch[2]) : null;

    // Parse GC info
    const gcMatch = recentLogs.match(/GC\s+\((\w+)\)\s+(\d+)\s+.*(\d+)\s*ms/);
    const gcCount = gcMatch ? parseInt(gcMatch[2]) : null;
    const gcTimeMs = gcMatch ? parseInt(gcMatch[3]) : null;

    if (heapUsedMb !== null && gcCount !== null && gcTimeMs !== null) {
      return { heapUsedMb, gcCount, gcTimeMs };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse player count from server logs.
 * Hytale logs player join/leave events. We count unique connected players
 * by scanning recent logs for join and disconnect patterns.
 */
async function parsePlayerCount(containerId: string): Promise<{
  online: number;
  max: number | null;
} | null> {
  try {
    const logs = await dockerManager.getContainerLogs(containerId, 500);
    const playerState = new Map<string, boolean>(); // name -> online

    for (const line of logs) {
      // Hytale player join patterns
      const joinMatch = line.match(/\[ServerPlayerListModule\].*connected.*?(\S+)\s*$/i)
        || line.match(/Player\s+(\S+)\s+connected/i)
        || line.match(/(\S+)\s+joined the game/i)
        || line.match(/PlayerConnected.*?(\S+)/i);
      if (joinMatch) {
        playerState.set(joinMatch[1], true);
        continue;
      }

      // Hytale player leave patterns
      const leaveMatch = line.match(/\[ServerPlayerListModule\].*disconnected.*?(\S+)\s*$/i)
        || line.match(/Player\s+(\S+)\s+disconnected/i)
        || line.match(/(\S+)\s+left the game/i)
        || line.match(/PlayerDisconnected.*?(\S+)/i);
      if (leaveMatch) {
        playerState.set(leaveMatch[1], false);
        continue;
      }
    }

    const online = Array.from(playerState.values()).filter(v => v).length;
    if (playerState.size > 0) {
      return { online, max: null };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get monitoring overview for all servers
 */
export async function getMonitoringOverview(userId: string, roles: string[]): Promise<{
  totalServers: number;
  onlineServers: number;
  totalMemoryUsed: number;
  totalMemoryLimit: number;
}> {
  const whereClause = roles.includes('admin') ? '' : `
    WHERE owner_id = $1 OR id IN (
      SELECT server_id FROM server_users WHERE user_id = $1
    )`;
  const params = roles.includes('admin') ? [] : [userId];

  const result = await getOne<{
    total: string;
    online: string;
    memoryUsed: string;
    memoryLimit: string;
  }>(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'running' THEN 1 END) as online,
      COALESCE(SUM(CASE WHEN status = 'running' THEN memory_limit_mb ELSE 0 END), 0)::text as memory_limit,
      COALESCE(SUM(CASE WHEN status = 'running' THEN memory_limit_mb * 0.5 ELSE 0 END), 0)::text as memory_used
    FROM servers
    ${whereClause}
  `, params);

  return {
    totalServers: parseInt(result?.total || '0'),
    onlineServers: parseInt(result?.online || '0'),
    totalMemoryUsed: parseFloat(result?.memoryUsed || '0'),
    totalMemoryLimit: parseFloat(result?.memoryLimit || '0'),
  };
}