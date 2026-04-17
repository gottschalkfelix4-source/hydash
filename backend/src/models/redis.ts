import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

let redisClient: RedisClientType;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export async function connectRedis(): Promise<void> {
  redisClient = createClient({ url: REDIS_URL }) as RedisClientType;

  redisClient.on('error', (err: Error) => {
    logger.error('Redis error:', err);
  });

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis client reconnecting...');
  });

  await redisClient.connect();
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

// ============================================
// Cache Helpers
// ============================================

const DEFAULT_TTL = 30; // seconds

/**
 * Get a cached value, or compute and cache it
 */
export async function cacheGetOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const client = getRedisClient();
  const cached = await client.get(key);

  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // Invalid JSON, recompute
    }
  }

  const value = await fn();
  const serialized = JSON.stringify(value ?? null);
  await client.setEx(key, ttl, serialized);
  return value;
}

/**
 * Set a cache value with optional TTL
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const client = getRedisClient();
  await client.setEx(key, ttl, JSON.stringify(value));
}

/**
 * Delete a cache key
 */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

/**
 * Delete all cache keys matching a pattern
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  const keys = await client.keys(pattern);
  if (keys.length > 0) {
    await client.del(keys);
  }
}

// ============================================
// Distributed Lock (for scheduled tasks)
// ============================================

/**
 * Acquire a distributed lock with TTL
 */
export async function acquireLock(lockKey: string, ttlMs: number = 30000): Promise<string | null> {
  const client = getRedisClient();
  const lockValue = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const result = await client.set(lockKey, lockValue, { PX: ttlMs, NX: true });
  return result === 'OK' ? lockValue : null;
}

/**
 * Release a distributed lock (only if we still hold it)
 */
export async function releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
  const client = getRedisClient();
  // Use a simple check-and-delete approach instead of eval
  const currentValue = await client.get(lockKey);
  if (currentValue === lockValue) {
    await client.del(lockKey);
    return true;
  }
  return false;
}

// ============================================
// Key Namespacing
// ============================================

export const RedisKeys = {
  // Auth
  refreshToken: (jti: string) => `hydash:refresh:${jti}`,
  apiKey: (key: string) => `hydash:apikey:${key}`,

  // Server metrics
  serverMetrics: (serverId: string) => `hydash:metrics:${serverId}`,
  serverMetricsHistory: (serverId: string) => `hydash:metrics:history:${serverId}`,

  // Server status cache
  serverStatus: (serverId: string) => `hydash:status:${serverId}`,

  // CurseForge cache
  curseforgeMod: (modId: number) => `hydash:cf:mod:${modId}`,
  curseforgeSearch: (hash: string) => `hydash:cf:search:${hash}`,

  // Hytale auth
  hytaleDeviceCode: (serverId: string) => `hydash:auth:device:${serverId}`,
  hytaleAuthState: (serverId: string) => `hydash:auth:state:${serverId}`,

  // Scheduled task lock
  taskLock: (taskId: string) => `hydash:lock:task:${taskId}`,

  // Setup state
  setupState: (serverId: string) => `hydash:setup:${serverId}`,
};