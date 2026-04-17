import axios from 'axios';
import { query, getOne } from '../models/db';
import { cacheSet, cacheDel, RedisKeys } from '../models/redis';
import logger from '../utils/logger';

// ============================================
// Hytale OAuth2 Configuration
// ============================================

const HYTALE_OAUTH_BASE = 'https://oauth.accounts.hytale.com';
const HYTALE_ACCOUNT_BASE = 'https://account-data.hytale.com';
const HYTALE_SESSIONS_BASE = 'https://sessions.hytale.com';

// Two separate OAuth clients - cannot be combined
// The downloader client uses auth:downloader scope for downloading server files
// The server client uses openid scope for running authenticated servers
const DOWNLOADER_CLIENT_ID = 'hytale-downloader';
const DOWNLOADER_SCOPE = 'auth:downloader';

const SERVER_CLIENT_ID = 'hytale-server';
const SERVER_SCOPE = 'openid';

// Cloudflare blocks requests with the default axios User-Agent header.
// Setting to empty string makes it pass Cloudflare's bot detection.
const NO_UA = { 'User-Agent': '' };

// ============================================
// Device Code Flow (Downloader Auth)
// ============================================

interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  idToken?: string;
  scope?: string;
  tokenType: string;
}

interface ProfilesResponse {
  owner: string;
  profiles: Array<{ uuid: string; name: string }>;
}

interface SessionResponse {
  sessionToken: string;
  identityToken: string;
}

/**
 * Start a device code authorization flow for downloading Hytale server files.
 * Uses the "hytale-downloader" client with "auth:downloader" scope.
 */
export async function startDeviceCodeFlow(serverId: string): Promise<DeviceCodeResponse> {
  logger.info(`Starting Hytale device code flow for server ${serverId}`);

  try {
    const response = await axios.post(`${HYTALE_OAUTH_BASE}/oauth2/device/auth`, new URLSearchParams({
      client_id: DOWNLOADER_CLIENT_ID,
      scope: DOWNLOADER_SCOPE,
    }), {
      headers: { ...NO_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });

    const data = response.data;

    const result: DeviceCodeResponse = {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUrl: data.verification_uri_complete || data.verification_uri || 'https://oauth.accounts.hytale.com/oauth2/device/verify',
      expiresIn: data.expires_in || 900,
      interval: data.interval || 5,
    };

    // Store in Redis for polling
    await cacheSet(RedisKeys.hytaleDeviceCode(serverId), {
      deviceCode: result.deviceCode,
      userCode: result.userCode,
      interval: result.interval,
    }, result.expiresIn);

    await cacheSet(RedisKeys.hytaleAuthState(serverId), {
      state: 'pending',
      userCode: result.userCode,
      verificationUrl: result.verificationUrl,
    }, result.expiresIn);

    logger.info(`Device code flow started for server ${serverId}: ${result.userCode}`);
    return result;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const msg = data?.error_description || data?.error || data?.message || error.message;
      logger.error(`Hytale device auth request failed (${status}): ${msg}`);
      logger.error(`Hytale device auth response data: ${JSON.stringify(data)}`);
      throw new Error(`Hytale authentication failed (${status}): ${msg}`);
    }
    logger.error(`Hytale device auth request failed:`, error);
    throw new Error('Failed to connect to Hytale authentication service. Please try again later.');
  }
}

/**
 * Poll the OAuth2 token endpoint to check if the user has authorized the device code.
 * Repeatedly calls until the user completes auth or the code expires.
 */
export async function pollDeviceAuth(serverId: string): Promise<{
  authorized: boolean;
  error?: string;
  accessToken?: string;
}> {
  const cached = await getCacheValue(RedisKeys.hytaleDeviceCode(serverId));
  if (!cached) {
    return { authorized: false, error: 'Device code expired. Please start a new device code flow.' };
  }

  const { deviceCode } = cached;

  try {
    const response = await axios.post(`${HYTALE_OAUTH_BASE}/oauth2/token`, new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: DOWNLOADER_CLIENT_ID,
    }), {
      headers: { ...NO_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    const data = response.data;
    const tokens: TokenResponse = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      tokenType: data.token_type || 'bearer',
    };

    // Store credentials in server config
    await storeDownloaderCredentials(serverId, tokens);

    // Update auth state
    await cacheSet(RedisKeys.hytaleAuthState(serverId), {
      state: 'authorized',
      message: 'Authorization successful',
    }, 3600);

    // Clear device code
    await cacheDel(RedisKeys.hytaleDeviceCode(serverId));

    logger.info(`Device auth completed for server ${serverId}`);
    return { authorized: true, accessToken: tokens.accessToken };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const data = error.response.data;

      if (status === 400 && data?.error === 'authorization_pending') {
        // User hasn't authorized yet - this is expected
        return { authorized: false };
      }

      if (status === 400 && data?.error === 'slow_down') {
        // Poll too frequently - slow down
        return { authorized: false };
      }

      if (status === 400 && data?.error === 'expired_token') {
        await cacheDel(RedisKeys.hytaleDeviceCode(serverId));
        await cacheSet(RedisKeys.hytaleAuthState(serverId), {
          state: 'expired',
          message: 'Device code expired. Please start a new flow.',
        }, 3600);
        return { authorized: false, error: 'Device code expired' };
      }

      if (status === 400 && data?.error === 'access_denied') {
        await cacheDel(RedisKeys.hytaleDeviceCode(serverId));
        await cacheSet(RedisKeys.hytaleAuthState(serverId), {
          state: 'denied',
          message: 'Authorization denied by user',
        }, 3600);
        return { authorized: false, error: 'Authorization denied' };
      }
    }

    logger.error(`Device auth poll error for server ${serverId}:`, error);
    return { authorized: false, error: 'Failed to check authorization status' };
  }
}

/**
 * Get the current auth state for a server
 */
export async function getAuthState(serverId: string): Promise<{
  state: string;
  userCode?: string;
  verificationUrl?: string;
  message?: string;
}> {
  const state = await getCacheValue(RedisKeys.hytaleAuthState(serverId));
  return state || { state: 'not_started', message: 'Setup not started' };
}

// ============================================
// Server Auth (for running the server)
// ============================================

/**
 * Authenticate with the Hytale server OAuth client to get server session tokens.
 * This is a separate flow from the downloader auth, using client_id "hytale-server".
 * Returns session tokens needed to start the Hytale server.
 */
export async function authenticateServer(serverId: string): Promise<{
  sessionToken: string;
  identityToken: string;
  ownerUuid: string;
} | null> {
  const creds = await getDownloaderCredentials(serverId);
  if (!creds) {
    logger.warn(`No downloader credentials found for server ${serverId}`);
    return null;
  }

  // Refresh the downloader token first if needed (only if we have a refresh token)
  let accessToken = creds.accessToken;
  if (creds.refreshToken && creds.expiresAt < Date.now() / 1000 + 300) {
    const refreshed = await refreshDownloaderToken(serverId, creds.refreshToken);
    if (!refreshed) return null;
    accessToken = refreshed.accessToken;
  }

  try {
    // Step 1: Get profiles using downloader access token
    const profilesResponse = await axios.get(`${HYTALE_ACCOUNT_BASE}/my-account/get-profiles`, {
      headers: { ...NO_UA, Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });

    const profiles = profilesResponse.data;
    const profileUuid = profiles.profiles?.[0]?.uuid;
    if (!profileUuid) {
      logger.error(`No game profile found for server ${serverId}`);
      return null;
    }

    // Step 2: Create game session
    const sessionResponse = await axios.post(`${HYTALE_SESSIONS_BASE}/game-session/new`, {
      uuid: profileUuid,
    }, {
      headers: { ...NO_UA, Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    });

    const sessionData = sessionResponse.data;

    return {
      sessionToken: sessionData.sessionToken || sessionData.session_token,
      identityToken: sessionData.identityToken || sessionData.identity_token,
      ownerUuid: profileUuid,
    };
  } catch (error) {
    logger.error(`Failed to create game session for server ${serverId}:`, error);
    return null;
  }
}

// ============================================
// Token Refresh
// ============================================

/**
 * Refresh the downloader OAuth token using the refresh token
 */
export async function refreshDownloaderToken(serverId: string, refreshToken: string): Promise<TokenResponse | null> {
  try {
    const response = await axios.post(`${HYTALE_OAUTH_BASE}/oauth2/token`, new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: DOWNLOADER_CLIENT_ID,
    }), {
      headers: { ...NO_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    const data = response.data;
    const tokens: TokenResponse = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      idToken: data.id_token,
      scope: data.scope,
      tokenType: data.token_type || 'bearer',
    };

    await storeDownloaderCredentials(serverId, tokens);
    return tokens;
  } catch (error) {
    logger.error(`Failed to refresh downloader token for server ${serverId}:`, error);
    return null;
  }
}

// ============================================
// Credential Storage
// ============================================

/**
 * Store OAuth credentials received from the frontend
 * (after browser-based device code flow completed by the user)
 */
export async function storeCredentialsFromFrontend(serverId: string, tokens: TokenResponse): Promise<void> {
  await storeDownloaderCredentials(serverId, tokens);

  // Update auth state
  await cacheSet(RedisKeys.hytaleAuthState(serverId), {
    state: 'authorized',
    message: 'Authorization successful',
  }, 3600);

  logger.info(`Frontend credentials stored for server ${serverId}`);
}

/**
 * Store downloader credentials in the server config
 */
async function storeDownloaderCredentials(serverId: string, tokens: TokenResponse): Promise<void> {
  await query(
    `UPDATE servers SET config = jsonb_set(
      COALESCE(config, '{}'),
      '{hytaleAuth}',
      $1
    ) WHERE id = $2`,
    [JSON.stringify({
      type: 'downloader',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || null,
      expiresAt: tokens.expiresAt,
    }), serverId]
  );
}

/**
 * Get stored downloader credentials from server config
 */
async function getDownloaderCredentials(serverId: string): Promise<TokenResponse | null> {
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
    tokenType: 'bearer',
  };
}

/**
 * Complete the device code authorization (legacy support)
 */
export async function completeDeviceAuth(serverId: string, _credentialPath: string): Promise<void> {
  await cacheDel(RedisKeys.hytaleDeviceCode(serverId));
  await cacheDel(RedisKeys.hytaleAuthState(serverId));
  logger.info(`Device auth completed for server ${serverId}`);
}

// ============================================
// Helpers
// ============================================

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