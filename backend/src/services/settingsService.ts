import { query, getOne } from '../models/db';
import { AppSettings, updateSettingsSchema } from '../types';
import { cacheDel, RedisKeys } from '../models/redis';

/**
 * Get public settings (no sensitive data)
 */
export async function getPublicSettings() {
  const settings = await getOne<AppSettings>(
    'SELECT id, panel_name, panel_description, metrics_refresh_interval_seconds, default_view_distance FROM app_settings WHERE id = 1'
  );
  return settings;
}

/**
 * Get all settings (admin only)
 */
export async function getAdminSettings(): Promise<AppSettings | null> {
  return getOne<AppSettings>('SELECT * FROM app_settings WHERE id = 1');
}

/**
 * Update settings (admin only)
 */
export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getAdminSettings();
  if (!current) throw new Error('Settings not found');

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fields = {
    panel_name: data.panelName,
    panel_description: data.panelDescription,
    metrics_refresh_interval_seconds: data.metricsRefreshIntervalSeconds,
    backup_retention_days: data.backupRetentionDays,
    metrics_retention_days: data.metricsRetentionDays,
    log_retention_days: data.logRetentionDays,
    max_servers_per_user: data.maxServersPerUser,
    default_memory_limit_mb: data.defaultMemoryLimitMb,
    default_view_distance: data.defaultViewDistance,
    curseforge_api_key: data.curseforgeApiKey,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return current;
  }

  values.push(1); // WHERE id = 1
  await query(
    `UPDATE app_settings SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  // Clear cached settings
  try {
    await cacheDel('hydash:settings:public');
  } catch {
    // Redis might not be available
  }

  return (await getAdminSettings())!;
}