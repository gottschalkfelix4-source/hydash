import { Request, Response } from 'express';
import * as curseforgeService from '../services/curseforgeService';
import { query, getOne, getMany } from '../models/db';
import { Mod, installModSchema } from '../types';
import { ZodError } from 'zod';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import logger from '../utils/logger';

const SERVER_DATA_DIR = process.env.SERVER_DATA_DIR || '/var/hydash/servers';

/**
 * Ensure the CurseForge API key is loaded from DB into the service
 */
async function ensureApiKey(): Promise<string | null> {
  const key = curseforgeService.getApiKey();
  if (key) return key;

  // Load from DB settings
  const settings = await getOne<{ curseforgeApiKey: string | null }>(
    'SELECT curseforge_api_key FROM app_settings WHERE id = 1'
  );

  const dbKey = settings?.curseforgeApiKey;
  if (dbKey) {
    curseforgeService.setApiKey(dbKey);
    return dbKey;
  }

  return null;
}

/**
 * Search mods on CurseForge
 */
export async function searchMods(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = await ensureApiKey();
    if (!apiKey) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    const q = req.query.q as string || '';
    const page = parseInt(req.query.page as string) || 0;
    const result = await curseforgeService.searchMods(q, page);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get featured mods
 */
export async function getFeaturedMods(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = await ensureApiKey();
    if (!apiKey) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    const mods = await curseforgeService.getFeaturedMods();
    res.json({ success: true, data: mods });
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    logger.error('Featured mods error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * List installed mods for a server
 */
export async function listInstalledMods(req: Request, res: Response): Promise<void> {
  try {
    const mods = await getMany<Mod>(
      'SELECT * FROM mods WHERE server_id = $1 ORDER BY installed_at DESC',
      [req.params.id]
    );
    res.json({ success: true, data: mods });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get mod files (versions) from CurseForge
 */
export async function getModFiles(req: Request, res: Response): Promise<void> {
  try {
    const apiKey = await ensureApiKey();
    if (!apiKey) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    const curseforgeId = parseInt(req.params.curseforgeId);
    if (isNaN(curseforgeId)) {
      res.status(400).json({ success: false, error: 'Invalid mod ID' });
      return;
    }
    const result = await curseforgeService.getModFiles(curseforgeId);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key')) {
      res.status(503).json({ success: false, error: 'CurseForge API key not configured' });
      return;
    }
    logger.error('Get mod files error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Install a mod from CurseForge
 */
export async function installMod(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const data = installModSchema.parse(req.body);

    // Get mod info from CurseForge
    const modInfo = await curseforgeService.getMod(data.curseforgeId);
    const files = await curseforgeService.getModFiles(data.curseforgeId);

    // Pick the latest release file if no specific file is requested
    const modFile = data.fileId
      ? files.files.find(f => f.id === data.fileId)
      : files.files.find(f => f.releaseType === 1);

    if (!modFile) {
      res.status(404).json({ success: false, error: 'No compatible mod file found' });
      return;
    }

    // Download the mod file
    const serverPath = path.join(SERVER_DATA_DIR, serverId, 'mods');
    await fs.mkdir(serverPath, { recursive: true });

    const modFilePath = path.join(serverPath, modFile.fileName);
    if (modFile.downloadUrl) {
      const response = await axios.get(modFile.downloadUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(modFilePath, Buffer.from(response.data));
    }

    // Insert mod record
    const result = await query<Mod>(
      `INSERT INTO mods (server_id, curseforge_id, mod_slug, file_name, file_version, file_type, file_size_bytes, download_url, active, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
       RETURNING *`,
      [
        serverId,
        data.curseforgeId,
        modInfo.slug,
        modFile.fileName,
        modFile.displayName,
        modFile.releaseType === 1 ? 'release' : modFile.releaseType === 2 ? 'beta' : 'alpha',
        modFile.fileLength,
        modFile.downloadUrl,
        JSON.stringify({ modName: modInfo.name, summary: modInfo.summary }),
      ]
    );

    logger.info(`Mod installed: ${modInfo.name} v${modFile.displayName} on server ${serverId}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: error.errors });
      return;
    }
    logger.error('Mod install error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Uninstall a mod
 */
export async function uninstallMod(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const modId = req.params.modId;

    const mod = await getOne<Mod>(
      'SELECT * FROM mods WHERE id = $1 AND server_id = $2',
      [modId, serverId]
    );

    if (!mod) {
      res.status(404).json({ success: false, error: 'Mod not found' });
      return;
    }

    // Delete the mod file from disk
    try {
      const modFilePath = path.join(SERVER_DATA_DIR, serverId, 'mods', mod.fileName);
      await fs.unlink(modFilePath);
    } catch {
      // File may already be deleted
    }

    // Delete from database
    await query('DELETE FROM mods WHERE id = $1', [modId]);

    logger.info(`Mod uninstalled: ${mod.fileName} from server ${serverId}`);
    res.json({ success: true, message: 'Mod uninstalled' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Update a mod to the latest version
 */
export async function updateMod(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const modId = req.params.modId;

    const mod = await getOne<Mod>(
      'SELECT * FROM mods WHERE id = $1 AND server_id = $2',
      [modId, serverId]
    );

    if (!mod || !mod.curseforgeId) {
      res.status(404).json({ success: false, error: 'Mod not found or no CurseForge ID' });
      return;
    }

    // Get latest version from CurseForge
    const files = await curseforgeService.getModFiles(mod.curseforgeId);
    const latestFile = files.files.find(f => f.releaseType === 1);

    if (!latestFile || latestFile.fileName === mod.fileName) {
      res.json({ success: true, message: 'Mod is already up to date', data: mod });
      return;
    }

    // Download new version
    const serverPath = path.join(SERVER_DATA_DIR, serverId, 'mods');
    const newFilePath = path.join(serverPath, latestFile.fileName);

    if (latestFile.downloadUrl) {
      const response = await axios.get(latestFile.downloadUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(newFilePath, Buffer.from(response.data));
    }

    // Delete old version
    try {
      const oldFilePath = path.join(serverPath, mod.fileName);
      await fs.unlink(oldFilePath);
    } catch { /* ignore */ }

    // Update database record
    const result = await query<Mod>(
      `UPDATE mods SET file_name = $1, file_version = $2, file_size_bytes = $3, download_url = $4
       WHERE id = $5 RETURNING *`,
      [latestFile.fileName, latestFile.displayName, latestFile.fileLength, latestFile.downloadUrl, modId]
    );

    logger.info(`Mod updated: ${latestFile.displayName} on server ${serverId}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Check for mod updates
 */
export async function checkModUpdates(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;

    const mods = await getMany<{ curseforgeId: number; fileVersion: string }>(
      'SELECT curseforge_id, file_version FROM mods WHERE server_id = $1 AND curseforge_id IS NOT NULL',
      [serverId]
    );

    const updates = await curseforgeService.checkModUpdates(
      mods.map(m => ({ curseforgeId: m.curseforgeId, fileVersion: m.fileVersion }))
    );

    res.json({ success: true, data: updates });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}