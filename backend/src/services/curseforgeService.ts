import axios from 'axios';
import logger from '../utils/logger';
import { cacheGetOrSet, RedisKeys } from '../models/redis';
import { CurseForgeMod, CurseForgeFile } from '../types';

const CURSEFORGE_API_BASE = 'https://api.curseforge.com';
const HYTALE_GAME_ID = 70216; // Hytale game ID on CurseForge

let apiKey = process.env.CURSEFORGE_API_KEY || '';

/**
 * Update the CurseForge API key (can be changed via settings)
 */
export function setApiKey(key: string): void {
  apiKey = key;
}

/**
 * Get the current CurseForge API key
 */
export function getApiKey(): string {
  return apiKey;
}

/**
 * Make an authenticated request to the CurseForge API
 */
async function curseforgeRequest<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  if (!apiKey) throw new Error('CurseForge API key not configured');

  const response = await axios.get<{ data: T }>(`${CURSEFORGE_API_BASE}${endpoint}`, {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
    params,
  });

  return response.data.data;
}

/**
 * Search for mods on CurseForge
 */
export async function searchMods(
  query: string,
  page: number = 0,
  pageSize: number = 20,
  sortField: number = 6 // 6=TotalDownloads, 2=Popularity, 4=Name, 3=LastUpdated
): Promise<{ mods: CurseForgeMod[]; totalCount: number }> {
  const cacheKey = RedisKeys.curseforgeSearch(
    `${query}-${page}-${pageSize}-${sortField}`
  );

  return cacheGetOrSet(cacheKey, async () => {
    const mods = await curseforgeRequest<CurseForgeMod[]>('/v1/mods/search', {
      gameId: HYTALE_GAME_ID,
      searchFilter: query,
      index: page * pageSize,
      pageSize,
      sortField,
    });

    return {
      mods: mods || [],
      totalCount: 0,
    };
  }, 300); // Cache for 5 minutes
}

/**
 * Get featured/popular mods
 */
export async function getFeaturedMods(): Promise<CurseForgeMod[]> {
  return cacheGetOrSet(
    RedisKeys.curseforgeSearch('featured'),
    async () => {
      if (!apiKey) throw new Error('CurseForge API key not configured');

      // CurseForge /v1/mods/featured is a POST endpoint with a JSON body
      const response = await axios.post(`${CURSEFORGE_API_BASE}/v1/mods/featured`, {
        gameId: HYTALE_GAME_ID,
        pageSize: 50,
      }, {
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      const result = response.data?.data;
      return result?.featured || result?.popular || [];
    },
    600 // Cache for 10 minutes
  );
}

/**
 * Get a single mod by ID
 */
export async function getMod(modId: number): Promise<CurseForgeMod> {
  return cacheGetOrSet(
    RedisKeys.curseforgeMod(modId),
    async () => {
      return await curseforgeRequest<CurseForgeMod>(`/v1/mods/${modId}`);
    },
    3600 // Cache for 1 hour
  );
}

/**
 * Get mod files (versions)
 */
export async function getModFiles(
  modId: number,
  gameVersion?: string,
  page: number = 0,
  pageSize: number = 20
): Promise<{ files: CurseForgeFile[]; totalCount: number }> {
  const params: Record<string, unknown> = {
    index: page * pageSize,
    pageSize,
  };

  if (gameVersion) {
    params.gameVersion = gameVersion;
  }

  const files = await curseforgeRequest<CurseForgeFile[]>(`/v1/mods/${modId}/files`, params);

  return {
    files: files || [],
    totalCount: 0,
  };
}

/**
 * Get a specific mod file
 */
export async function getModFile(modId: number, fileId: number): Promise<CurseForgeFile> {
  return await curseforgeRequest<CurseForgeFile>(
    `/v1/mods/${modId}/files/${fileId}`
  );
}

/**
 * Get download URL for a mod file
 */
export async function getModFileDownloadUrl(modId: number, fileId: number): Promise<string> {
  return await curseforgeRequest<string>(
    `/v1/mods/${modId}/files/${fileId}/download-url`
  );
}

/**
 * Resolve mod dependencies
 */
export async function resolveDependencies(modId: number, fileId: number): Promise<CurseForgeFile[]> {
  const file = await getModFile(modId, fileId);
  const dependencies: CurseForgeFile[] = [];

  if (file.dependencies) {
    for (const dep of file.dependencies) {
      // Only resolve required dependencies (type 3)
      if (dep.relationType === 3) {
        try {
          const depFiles = await getModFiles(dep.modId);
          const latestFile = depFiles.files.find(f => f.releaseType === 1);
          if (latestFile) {
            dependencies.push(latestFile);
          }
        } catch (error) {
          logger.warn(`Failed to resolve dependency mod ${dep.modId}:`, error);
        }
      }
    }
  }

  return dependencies;
}

/**
 * Check for mod updates
 */
export async function checkModUpdates(
  mods: Array<{ curseforgeId: number; fileVersion: string }>
): Promise<Array<{ curseforgeId: number; currentVersion: string; latestVersion: string; updateAvailable: boolean }>> {
  const updates = [];

  for (const mod of mods) {
    try {
      const files = await getModFiles(mod.curseforgeId);
      const latestRelease = files.files.find(f => f.releaseType === 1);

      updates.push({
        curseforgeId: mod.curseforgeId,
        currentVersion: mod.fileVersion,
        latestVersion: latestRelease?.displayName || latestRelease?.fileName || mod.fileVersion,
        updateAvailable: latestRelease
          ? latestRelease.fileName !== mod.fileVersion
          : false,
      });
    } catch (error) {
      logger.warn(`Failed to check updates for mod ${mod.curseforgeId}:`, error);
      updates.push({
        curseforgeId: mod.curseforgeId,
        currentVersion: mod.fileVersion,
        latestVersion: mod.fileVersion,
        updateAvailable: false,
      });
    }
  }

  return updates;
}