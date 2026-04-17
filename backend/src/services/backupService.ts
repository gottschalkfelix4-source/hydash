import { query, getOne, getMany } from '../models/db';
import { Backup, createBackupSchema } from '../types';
import { createBackup, deleteBackupFile, restoreBackup as restoreBackupFile } from '../utils/backup';
import logger from '../utils/logger';

/**
 * Create a backup for a server
 */
export async function createServerBackup(
  serverId: string,
  backupType: 'full' | 'universe' | 'config' = 'full',
  retentionDays: number = 14
): Promise<Backup> {
  const server = await getOne<{ id: string; name: string; status: string }>(
    'SELECT id, name, status FROM servers WHERE id = $1',
    [serverId]
  );

  if (!server) throw new Error('Server not found');

  // Generate backup filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${server.name}-${backupType}-${timestamp}.tar.gz`;

  logger.info(`Creating ${backupType} backup for server ${server.name}: ${filename}`);

  // Create the backup archive
  const { filePath, sizeBytes } = await createBackup(serverId, backupType, filename);

  // Calculate expiration date
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

  // Save backup record to database
  const result = await query<Backup>(
    `INSERT INTO backups (server_id, filename, size_bytes, backup_type, retention_days, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [serverId, filename, sizeBytes, backupType, retentionDays, expiresAt]
  );

  return result.rows[0];
}

/**
 * List backups for a server
 */
export async function listBackups(serverId: string): Promise<Backup[]> {
  return getMany<Backup>(
    'SELECT * FROM backups WHERE server_id = $1 ORDER BY created_at DESC',
    [serverId]
  );
}

/**
 * Get a single backup
 */
export async function getBackup(backupId: string): Promise<Backup | null> {
  return getOne<Backup>('SELECT * FROM backups WHERE id = $1', [backupId]);
}

/**
 * Restore a backup
 */
export async function restoreServerBackup(backupId: string): Promise<void> {
  const backup = await getBackup(backupId);
  if (!backup) throw new Error('Backup not found');

  logger.info(`Restoring backup ${backup.filename} for server ${backup.serverId}`);

  // The server should be stopped before restoring
  // This should be handled by the caller
  await restoreBackupFile(backup.serverId, backup.filename);

  logger.info(`Backup restored: ${backup.filename}`);
}

/**
 * Delete a backup
 */
export async function deleteBackup(backupId: string): Promise<void> {
  const backup = await getBackup(backupId);
  if (!backup) throw new Error('Backup not found');

  // Delete the file from disk
  try {
    await deleteBackupFile(backup.serverId, backup.filename);
  } catch (error) {
    logger.warn(`Failed to delete backup file ${backup.filename}:`, error);
  }

  // Delete from database
  await query('DELETE FROM backups WHERE id = $1', [backupId]);

  logger.info(`Backup deleted: ${backup.filename}`);
}

/**
 * Clean up expired backups (called by cron job)
 */
export async function cleanupExpiredBackups(): Promise<number> {
  const result = await query<{ count: string }>(
    `DELETE FROM backups WHERE expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING COUNT(*) as count`
  );

  // Also delete the files from disk
  const expired = await getMany<Backup>(
    "SELECT * FROM backups WHERE expires_at IS NOT NULL AND expires_at < NOW()"
  );

  for (const backup of expired) {
    try {
      await deleteBackupFile(backup.serverId, backup.filename);
    } catch (error) {
      logger.warn(`Failed to delete expired backup file ${backup.filename}:`, error);
    }
  }

  const count = parseInt(result.rows[0]?.count || '0');
  logger.info(`Cleaned up ${count} expired backups`);
  return count;
}

/**
 * Clean up old metrics (called by cron job)
 */
export async function cleanupOldMetrics(): Promise<number> {
  const settings = await getOne<{ metrics_retention_days: number }>(
    'SELECT metrics_retention_days FROM app_settings WHERE id = 1'
  );
  const retentionDays = settings?.metrics_retention_days || 90;

  const result = await query<{ count: string }>(
    `DELETE FROM metrics_history WHERE timestamp < NOW() - ($1 || ' days')::INTERVAL
     RETURNING COUNT(*) as count`,
    [retentionDays]
  );

  const count = parseInt(result.rows[0]?.count || '0');
  logger.info(`Cleaned up ${count} old metrics records (retention: ${retentionDays} days)`);
  return count;
}

/**
 * Clean up old server logs (called by cron job)
 */
export async function cleanupOldLogs(): Promise<number> {
  const settings = await getOne<{ log_retention_days: number }>(
    'SELECT log_retention_days FROM app_settings WHERE id = 1'
  );
  const retentionDays = settings?.log_retention_days || 30;

  const result = await query<{ count: string }>(
    `DELETE FROM server_logs WHERE timestamp < NOW() - ($1 || ' days')::INTERVAL
     RETURNING COUNT(*) as count`,
    [retentionDays]
  );

  const count = parseInt(result.rows[0]?.count || '0');
  logger.info(`Cleaned up ${count} old log records (retention: ${retentionDays} days)`);
  return count;
}