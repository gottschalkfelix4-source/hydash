import Dockerode from 'dockerode';
import logger from './logger';

const docker = new Dockerode({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

export interface CreateContainerOptions {
  name: string;
  port: number;
  memoryLimitMb: number;
  cpuQuotaMicro: number;
  jvmArgs?: string;
  serverArgs?: string;
  serverId: string;
}

class DockerManager {
  /**
   * Create a new Hytale server container
   */
  async createContainer(options: CreateContainerOptions): Promise<string> {
    const {
      name,
      port,
      memoryLimitMb,
      cpuQuotaMicro,
      jvmArgs,
      serverArgs,
      serverId,
    } = options;

    const containerName = `hydash-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Use the named Docker volume (same as the backend uses) so the server
    // container can access files written by the backend via the same volume.
    const serversVolume = process.env.SERVERS_VOLUME_NAME || 'ollamaqwen35hydash_hydash_servers';

    logger.info(`Creating container: ${containerName}`);

    const container = await docker.createContainer({
      name: containerName,
      Image: process.env.HYTALE_IMAGE || 'eclipse-temurin:25-jre',
      Cmd: [
        'sh', '-c',
        `cd Server && java ${jvmArgs || '-Xms2G -Xmx2G -XX:+UseG1GC'} -jar HytaleServer.jar ${serverArgs || '--assets ../Assets.zip --backup --backup-dir backups --backup-frequency 30'}`,
      ],
      ExposedPorts: {
        [`${port}/udp`]: {},
      },
      HostConfig: {
        PortBindings: {
          [`${port}/udp`]: [{ HostPort: `${port}` }],
        },
        Memory: memoryLimitMb * 1024 * 1024,
        CpuQuota: cpuQuotaMicro,
        RestartPolicy: { Name: 'unless-stopped' },
        Mounts: [
          {
            Target: '/var/hydash/servers',
            Source: serversVolume,
            Type: 'volume',
            ReadOnly: false,
          },
        ],
        SecurityOpt: ['label=disable'],
      },
      Labels: {
        'hydash.managed': 'true',
        'hydash.server-id': serverId,
      },
      WorkingDir: `/var/hydash/servers/${serverId}`,
    });

    logger.info(`Container created: ${container.id} (${containerName})`);
    return container.id;
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.start();
    logger.info(`Container started: ${containerId}`);
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string, timeout: number = 30): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.stop({ t: timeout });
    logger.info(`Container stopped: ${containerId}`);
  }

  /**
   * Restart a container
   */
  async restartContainer(containerId: string, timeout: number = 30): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.restart({ t: timeout });
    logger.info(`Container restarted: ${containerId}`);
  }

  /**
   * Remove a container
   */
  async removeContainer(containerId: string, force: boolean = false): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.remove({ force });
    logger.info(`Container removed: ${containerId}`);
  }

  /**
   * Get container stats
   */
  async getContainerStats(containerId: string): Promise<{
    cpuPercent: number;
    memoryUsage: number;
    memoryLimit: number;
    networkRx: number;
    networkTx: number;
    blockRead: number;
    blockWrite: number;
  }> {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 && cpuDelta > 0
      ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100
      : 0;

    // Memory
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 0;

    // Network
    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      for (const iface of Object.values(stats.networks) as Array<{ rx_bytes: number; tx_bytes: number }>) {
        networkRx += iface.rx_bytes;
        networkTx += iface.tx_bytes;
      }
    }

    // Block I/O
    let blockRead = 0;
    let blockWrite = 0;
    if (stats.blkio_stats?.io_service_bytes_recursive) {
      for (const entry of stats.blkio_stats.io_service_bytes_recursive) {
        if (entry.op === 'read') blockRead += entry.value;
        if (entry.op === 'write') blockWrite += entry.value;
      }
    }

    return {
      cpuPercent,
      memoryUsage,
      memoryLimit,
      networkRx,
      networkTx,
      blockRead,
      blockWrite,
    };
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerId: string, tail: number = 100): Promise<string[]> {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    });

    // Parse Docker log stream (8-byte header per frame)
    const lines: string[] = [];
    const buffer = Buffer.isBuffer(logs) ? logs : Buffer.from(logs as unknown as ArrayBuffer);
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      // Skip header (8 bytes: stream type + padding + length)
      const length = buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (offset + length > buffer.length) break;
      const line = buffer.toString('utf-8', offset, offset + length).trim();
      if (line) lines.push(line);
      offset += length;
    }

    return lines;
  }

  /**
   * Execute a command inside a running container
   */
  async execInContainer(containerId: string, cmd: string[]): Promise<string> {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      stream.on('end', () => resolve(output.trim()));
      stream.on('error', reject);

      // Timeout after 30 seconds
      setTimeout(() => {
        stream.destroy();
        resolve(output.trim());
      }, 30000);
    });
  }

  /**
   * Inspect a container
   */
  async inspectContainer(containerId: string): Promise<Dockerode.ContainerInspectInfo> {
    const container = docker.getContainer(containerId);
    return container.inspect();
  }

  /**
   * List all Hydash-managed containers
   */
  async listHydashContainers(): Promise<Dockerode.ContainerInfo[]> {
    const containers = await docker.listContainers({
      all: true,
      filters: {
        label: ['hydash.managed=true'],
      },
    });
    return containers;
  }

  /**
   * Ping Docker daemon
   */
  async ping(): Promise<boolean> {
    try {
      await docker.ping();
      return true;
    } catch {
      return false;
    }
  }
}

export const dockerManager = new DockerManager();
export default dockerManager;