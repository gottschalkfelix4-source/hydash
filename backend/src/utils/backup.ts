import path from 'path';
import fs from 'fs/promises';
import * as tar from 'tar';
import logger from './logger';

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/hydash/backups';
const SERVER_DATA_DIR = process.env.SERVER_DATA_DIR || '/var/hydash/servers';

/**
 * Create a backup archive of server data
 */
export async function createBackup(
  serverId: string,
  backupType: 'full' | 'universe' | 'config',
  filename: string
): Promise<{ filePath: string; sizeBytes: number }> {
  const serverPath = path.join(SERVER_DATA_DIR, serverId);
  const backupPath = path.join(BACKUP_DIR, serverId);

  // Ensure backup directory exists
  await fs.mkdir(backupPath, { recursive: true });

  const archivePath = path.join(backupPath, filename);

  // Determine what to include based on backup type
  let files: string[] = [];
  switch (backupType) {
    case 'full':
      files = ['.']; // Everything
      break;
    case 'universe':
      files = ['universe'];
      break;
    case 'config':
      files = ['config.json', 'permissions.json', 'whitelist.json', 'bans.json'];
      break;
  }

  logger.info(`Creating ${backupType} backup for server ${serverId}: ${filename}`);

  try {
    await tar.create(
      {
        file: archivePath,
        cwd: serverPath,
        gzip: true,
      },
      files
    );

    const stat = await fs.stat(archivePath);
    logger.info(`Backup created: ${archivePath} (${stat.size} bytes)`);

    return {
      filePath: archivePath,
      sizeBytes: stat.size,
    };
  } catch (error) {
    logger.error(`Backup creation failed for server ${serverId}:`, error);
    throw error;
  }
}

/**
 * Restore a server from a backup archive
 */
export async function restoreBackup(
  serverId: string,
  filename: string
): Promise<void> {
  const serverPath = path.join(SERVER_DATA_DIR, serverId);
  const archivePath = path.join(BACKUP_DIR, serverId, filename);

  logger.info(`Restoring backup for server ${serverId}: ${filename}`);

  // Verify archive exists
  try {
    await fs.access(archivePath);
  } catch {
    throw new Error(`Backup file not found: ${filename}`);
  }

  // Stop server before restoring
  // (This should be handled by the caller - serverService.stopServer)

  // Create a temporary directory for restoration
  const tempDir = path.join(SERVER_DATA_DIR, `${serverId}-restore-temp`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // Extract backup to temp directory
    await tar.extract({
      file: archivePath,
      cwd: tempDir,
    });

    // Move restored files to server directory
    const entries = await fs.readdir(tempDir);
    for (const entry of entries) {
      const srcPath = path.join(tempDir, entry);
      const destPath = path.join(serverPath, entry);
      await fs.rename(srcPath, destPath);
    }

    logger.info(`Backup restored successfully for server ${serverId}`);
  } catch (error) {
    logger.error(`Backup restoration failed for server ${serverId}:`, error);
    throw error;
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Delete a backup file
 */
export async function deleteBackupFile(serverId: string, filename: string): Promise<void> {
  const archivePath = path.join(BACKUP_DIR, serverId, filename);
  await fs.unlink(archivePath);
  logger.info(`Backup deleted: ${archivePath}`);
}

/**
 * Get backup file info
 */
export async function getBackupFileInfo(serverId: string, filename: string) {
  const archivePath = path.join(BACKUP_DIR, serverId, filename);
  try {
    const stat = await fs.stat(archivePath);
    return {
      exists: true,
      sizeBytes: stat.size,
      createdAt: stat.birthtime,
      modifiedAt: stat.mtime,
    };
  } catch {
    return { exists: false };
  }
}