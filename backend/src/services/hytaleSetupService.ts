import { getOne, query } from '../models/db';
import { cacheSet, RedisKeys } from '../models/redis';
import * as downloadService from './hytaleDownloadService';
import * as authService from './hytaleAuthService';
import logger from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const SERVER_DATA_DIR = process.env.SERVER_DATA_DIR || '/var/hydash/servers';

/**
 * Start the Hytale server setup wizard.
 * This orchestrates the full setup: auth → download → configure → ready
 */
export async function startSetup(serverId: string): Promise<{
  step: string;
  message: string;
  deviceCode?: string;
  userCode?: string;
  verificationUrl?: string;
}> {
  const server = await getOne<{ id: string; name: string; status: string }>(
    'SELECT id, name, status FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server) throw new Error('Server not found');

  logger.info(`Starting setup wizard for server ${serverId}`);

  // Check if server is already set up
  const isReady = await downloadService.isServerReady(serverId);
  if (isReady) {
    return { step: 'complete', message: 'Server is already set up' };
  }

  // Create server data directory
  const serverPath = path.join(SERVER_DATA_DIR, serverId);
  try {
    await fs.mkdir(serverPath, { recursive: true });
    await fs.mkdir(path.join(serverPath, 'mods'), { recursive: true });
    await fs.mkdir(path.join(serverPath, 'universe'), { recursive: true });
    await fs.mkdir(path.join(serverPath, 'logs'), { recursive: true });
  } catch {
    // Directories may already exist
  }

  // Start device code auth flow
  try {
    const deviceCode = await authService.startDeviceCodeFlow(serverId);

    // Set initial setup state
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'auth',
      step: 'auth',
      message: 'Authenticate with your Hytale account',
      progress: 0,
    }, 3600);

    return {
      step: 'auth',
      message: 'Authenticate with your Hytale account',
      deviceCode: deviceCode.deviceCode,
      userCode: deviceCode.userCode,
      verificationUrl: deviceCode.verificationUrl,
    };
  } catch (error) {
    logger.error(`Failed to start device code flow for server ${serverId}:`, error);
    throw new Error('Failed to start authentication. Please try again.');
  }
}

/**
 * Get setup status
 */
export async function getSetupStatus(serverId: string) {
  return downloadService.getSetupStatus(serverId);
}

/**
 * Continue setup after authentication - starts the download
 */
export async function continueAfterAuth(serverId: string): Promise<{
  step: string;
  message: string;
}> {
  // Start the download in background
  downloadService.downloadServerFiles(serverId).catch(err => {
    logger.error(`Background download failed for server ${serverId}:`, err);
  });

  return { step: 'downloading', message: 'Server files are being downloaded' };
}

/**
 * Check if server is ready
 */
export async function isServerReady(serverId: string): Promise<boolean> {
  return downloadService.isServerReady(serverId);
}

/**
 * Get the Hytale server version using the downloader CLI
 */
export async function getHytaleVersion(): Promise<string> {
  const HYTALE_DOWNLOADER = process.env.HYTALE_DOWNLOADER_PATH || '/usr/local/bin/hytale-downloader';

  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync(HYTALE_DOWNLOADER, ['-print-version'], {
      timeout: 30000,
    });

    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Generate startup command for a Hytale server with session tokens
 * Uses the hytale-server OAuth client to get session tokens
 */
export async function getServerStartupArgs(serverId: string): Promise<string[]> {
  const server = await getOne<{ id: string; name: string; config: Record<string, unknown>; jvmArgs: string; serverArgs: string }>(
    'SELECT id, name, config, jvm_args, server_args FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server) throw new Error('Server not found');

  const args: string[] = [];

  // Try to get server session tokens
  const session = await authService.authenticateServer(serverId);

  if (session) {
    args.push('--session-token', session.sessionToken);
    args.push('--identity-token', session.identityToken);
    args.push('--owner-uuid', session.ownerUuid);
  }

  // Add server args from config
  if (server.serverArgs) {
    args.push(...server.serverArgs.split(' ').filter(Boolean));
  }

  // Ensure assets flag is present
  if (!args.includes('--assets')) {
    args.push('--assets', '../Assets.zip');
  }

  return args;
}