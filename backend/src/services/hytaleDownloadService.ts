import { getOne } from '../models/db';
import { cacheSet, RedisKeys } from '../models/redis';
import * as hytaleAuthService from './hytaleAuthService';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import { createWriteStream } from 'fs';

const SERVER_DATA_DIR = process.env.SERVER_DATA_DIR || '/var/hydash/servers';

// Cloudflare blocks the default axios User-Agent
const NO_UA = { 'User-Agent': '' };

// ============================================
// Download Hytale Server Files
// ============================================

export async function downloadServerFiles(serverId: string): Promise<void> {
  const server = await getOne<{ id: string; name: string; status: string }>(
    'SELECT id, name, status FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server) throw new Error('Server not found');

  logger.info(`Starting Hytale server file download for server ${serverId}`);

  await cacheSet(RedisKeys.setupState(serverId), {
    status: 'downloading',
    message: 'Downloading Hytale server files...',
    progress: 0,
  }, 3600);

  const serverPath = `${SERVER_DATA_DIR}/${serverId}`;

  try {
    await fs.mkdir(serverPath, { recursive: true });

    const creds = await getDownloaderCredentials(serverId);
    if (!creds) {
      throw new Error('No downloader credentials found. Please authenticate first.');
    }

    // Check if token is expired
    if (creds.expiresAt < Date.now() / 1000 + 300) {
      if (creds.refreshToken) {
        logger.info(`Refreshing expired token for server ${serverId}`);
        const refreshed = await hytaleAuthService.refreshDownloaderToken(serverId, creds.refreshToken);
        if (refreshed) {
          creds.accessToken = refreshed.accessToken;
          creds.expiresAt = refreshed.expiresAt;
        } else {
          throw new Error('OAuth token expired. Please re-authenticate to get a new token.');
        }
      } else {
        throw new Error('OAuth token expired. Please re-authenticate to get a new token.');
      }
    }

    const accessToken = creds.accessToken;
    const patchline = 'release';

    // Step 1: Get signed manifest URL
    logger.info(`Fetching signed manifest URL for server ${serverId}`);
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'downloading',
      message: 'Fetching download manifest...',
      progress: 10,
    }, 3600);

    let version = 'unknown';
    let manifestUrl: string | null = null;

    // Try the manifest endpoint (returns a signed URL to the version manifest)
    try {
      const manifestRes = await axios.get(
        `https://account-data.hytale.com/game-assets/version/${patchline}.json`,
        { headers: { ...NO_UA, Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
      );
      manifestUrl = manifestRes.data?.url;
      logger.info(`Got signed manifest URL for server ${serverId}`);
    } catch (err) {
      logger.error(`Failed to get manifest URL: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw new Error('Failed to get download manifest from Hytale. Your authorization may not include download access. Please re-authenticate.');
    }

    if (!manifestUrl) {
      throw new Error('No manifest URL returned from Hytale API.');
    }

    // Step 2: Fetch the manifest (contains version + download path)
    logger.info(`Fetching version manifest for server ${serverId}`);
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'downloading',
      message: 'Fetching version info...',
      progress: 15,
    }, 3600);

    let downloadUrl: string | null = null;
    let relativeDownloadPath: string | null = null;
    try {
      const versionRes = await axios.get(manifestUrl, {
        headers: { ...NO_UA },
        timeout: 15000,
      });
      version = versionRes.data?.version || 'unknown';
      // download_url is a relative path like "builds/release/2026.03.26-xxx.zip"
      relativeDownloadPath = versionRes.data?.download_url;
      logger.info(`Hytale version: ${version}, download path: ${relativeDownloadPath}`);
    } catch (err) {
      logger.warn(`Could not parse version manifest`);
    }

    // Step 3: Get a signed download URL for the actual zip file
    // The game-assets endpoint signs URLs per-path, so we request a signed URL
    // for the relative download path we got from the manifest
    if (relativeDownloadPath) {
      logger.info(`Getting signed download URL for ${relativeDownloadPath}`);
      await cacheSet(RedisKeys.setupState(serverId), {
        status: 'downloading',
        message: `Preparing download of Hytale v${version}...`,
        progress: 20,
      }, 3600);

      try {
        const signedRes = await axios.get(
          `https://account-data.hytale.com/game-assets/${relativeDownloadPath}`,
          { headers: { ...NO_UA, Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
        );
        downloadUrl = signedRes.data?.url;
      } catch (err) {
        logger.error(`Failed to get signed download URL: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }

    if (!downloadUrl) {
      throw new Error('Could not get download URL from Hytale. Please try again or re-authenticate.');
    }

    // Step 4: Download the zip file
    const archivePath = path.join(serverPath, `hytale-${patchline}.zip`);
    logger.info(`Downloading Hytale v${version} to ${archivePath}`);
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'downloading',
      message: `Downloading Hytale v${version}...`,
      progress: 20,
    }, 3600);

    await downloadFile(downloadUrl, archivePath, serverId);

    // Step 5: Extract server files
    logger.info(`Extracting Hytale server files for server ${serverId}`);
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'downloading',
      message: 'Extracting server files...',
      progress: 80,
    }, 3600);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    await execAsync(`unzip -o "${archivePath}" -d "${serverPath}"`, { timeout: 300000 });
    await fs.unlink(archivePath).catch(() => {});

    // Step 6: Clean up unnecessary files (Client directory is not needed for dedicated server)
    const clientDir = path.join(serverPath, 'Client');
    await fs.rm(clientDir, { recursive: true, force: true }).catch(() => {});

    // Ensure the Server/ directory has a backups/ subdirectory (required by --backup-dir)
    const backupsDir = path.join(serverPath, 'Server', 'backups');
    await fs.mkdir(backupsDir, { recursive: true });

    // Step 7: Verify download
    const jarExists = await fs.access(path.join(serverPath, 'Server', 'HytaleServer.jar')).then(() => true).catch(() => false);
    const assetsExist = await fs.access(path.join(serverPath, 'Assets.zip')).then(() => true).catch(() => false);

    if (!jarExists && !assetsExist) {
      throw new Error('Download completed but server files not found. The archive structure may have changed.');
    }

    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'completed',
      message: 'Download complete',
      progress: 100,
    }, 3600);

    logger.info(`Hytale v${version} downloaded and extracted for server ${serverId}`);
  } catch (error) {
    await cacheSet(RedisKeys.setupState(serverId), {
      status: 'error',
      message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      progress: 0,
    }, 3600);

    logger.error(`Hytale download failed for server ${serverId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// ============================================
// Download with progress
// ============================================

async function downloadFile(url: string, destPath: string, serverId: string): Promise<void> {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 600000,
  });

  const totalSize = parseInt(response.headers['content-length'] || '0', 10);
  let downloadedSize = 0;
  let lastProgressUpdate = 0;

  const writer = createWriteStream(destPath);

  response.data.on('data', (chunk: Buffer) => {
    downloadedSize += chunk.length;
    const progress = totalSize > 0 ? Math.floor((downloadedSize / totalSize) * 60) + 20 : 40;
    if (progress > lastProgressUpdate + 5) {
      lastProgressUpdate = progress;
      const mb = (downloadedSize / 1024 / 1024).toFixed(1);
      const totalMb = totalSize > 0 ? (totalSize / 1024 / 1024).toFixed(1) : '?';
      cacheSet(RedisKeys.setupState(serverId), {
        status: 'downloading',
        message: `Downloading... ${mb} / ${totalMb} MB`,
        progress,
      }, 3600).catch(() => {});
    }
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}

// ============================================
// Setup Status
// ============================================

export async function getSetupStatus(serverId: string): Promise<{
  status: string;
  message: string;
  progress: number;
}> {
  try {
    const state = await getCacheValue(RedisKeys.setupState(serverId));
    return state || { status: 'not_started', message: 'Setup not started', progress: 0 };
  } catch {
    return { status: 'unknown', message: 'Could not determine setup status', progress: 0 };
  }
}

export async function isServerReady(serverId: string): Promise<boolean> {
  const serverPath = path.join(SERVER_DATA_DIR, serverId);
  try {
    const jarPaths = [
      path.join(serverPath, 'HytaleServer.jar'),
      path.join(serverPath, 'Server', 'HytaleServer.jar'),
    ];
    for (const jarPath of jarPaths) {
      try { await fs.access(jarPath); return true; } catch { /* next */ }
    }
    return false;
  } catch {
    return false;
  }
}

// ============================================
// Helpers
// ============================================

async function getDownloaderCredentials(serverId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
} | null> {
  const server = await getOne<{ config: Record<string, unknown> }>(
    'SELECT config FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server?.config?.hytaleAuth) return null;

  const auth = server.config.hytaleAuth as Record<string, unknown>;
  if (!auth.accessToken) return null;

  return {
    accessToken: auth.accessToken as string,
    refreshToken: (auth.refreshToken as string) || undefined,
    expiresAt: auth.expiresAt as number,
  };
}

async function getCacheValue(key: string): Promise<any> {
  try {
    const { getRedisClient } = await import('../models/redis');
    const client = getRedisClient();
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}