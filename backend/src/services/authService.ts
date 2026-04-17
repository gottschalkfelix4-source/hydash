import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, getOne } from '../models/db';
import { generateTokenPair, verifyToken } from '../middleware/auth';
import { RedisKeys, cacheDel } from '../models/redis';
import logger from '../utils/logger';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  legacyRole: string | null;
  isActive: boolean;
}

interface RolePermissionRow {
  roles: string[];
  permissions: string[];
}

/**
 * Register a new user
 */
export async function register(email: string, password: string, displayName?: string) {
  // Check if user already exists
  const existing = await getOne<UserRow>(
    'SELECT id FROM users WHERE email = $1',
    [email]
  );
  if (existing) {
    throw new Error('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create user
  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, legacy_role`,
    [email, passwordHash, displayName || null]
  );

  const user = result.rows[0];

  // Assign default 'viewer' role
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, id FROM roles WHERE name = 'viewer'`,
    [user.id]
  );

  // Get roles and permissions
  const rolesAndPerms = await getUserRolesAndPermissions(user.id);

  // Generate tokens
  const tokens = generateTokenPair({
    userId: user.id,
    email: user.email,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
  });

  logger.info(`User registered: ${email}`);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: rolesAndPerms.roles,
      permissions: rolesAndPerms.permissions,
    },
    ...tokens,
  };
}

/**
 * Login user
 */
export async function login(email: string, password: string) {
  const user = await getOne<UserRow>(
    'SELECT id, email, password_hash, display_name, legacy_role, is_active FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    throw new Error('Account is disabled');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  // Update last login
  await query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id]
  );

  const rolesAndPerms = await getUserRolesAndPermissions(user.id);

  const tokens = generateTokenPair({
    userId: user.id,
    email: user.email,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
  });

  logger.info(`User logged in: ${email}`);

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: rolesAndPerms.roles,
      permissions: rolesAndPerms.permissions,
    },
    ...tokens,
  };
}

/**
 * Refresh access token
 */
export async function refreshToken(token: string) {
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }

  // Verify user still exists and is active
  const user = await getOne<UserRow>(
    'SELECT id, email, is_active FROM users WHERE id = $1',
    [payload.userId]
  );

  if (!user || !user.isActive) {
    throw new Error('User not found or disabled');
  }

  const rolesAndPerms = await getUserRolesAndPermissions(user.id);

  return generateTokenPair({
    userId: user.id,
    email: user.email,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
  });
}

/**
 * Get current user info
 */
export async function getMe(userId: string) {
  const user = await getOne<UserRow>(
    'SELECT id, email, display_name, legacy_role, is_active FROM users WHERE id = $1',
    [userId]
  );

  if (!user) {
    throw new Error('User not found');
  }

  const rolesAndPerms = await getUserRolesAndPermissions(user.id);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: rolesAndPerms.roles,
    permissions: rolesAndPerms.permissions,
  };
}

/**
 * Generate API key for a user
 */
export async function generateApiKey(userId: string): Promise<string> {
  const apiKey = `hydash_${crypto.randomBytes(32).toString('hex')}`;

  await query(
    'UPDATE users SET api_key = $1, api_key_created_at = NOW() WHERE id = $2',
    [apiKey, userId]
  );

  return apiKey;
}

/**
 * Update own profile (displayName)
 */
export async function updateProfile(userId: string, displayName: string) {
  await query(
    'UPDATE users SET display_name = $1 WHERE id = $2',
    [displayName, userId]
  );

  return getMe(userId);
}

/**
 * Change own password (requires current password verification)
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await getOne<UserRow>(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (!user) {
    throw new Error('User not found');
  }

  const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!validPassword) {
    throw new Error('Current password is incorrect');
  }

  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

/**
 * Get user roles and permissions
 */
async function getUserRolesAndPermissions(userId: string): Promise<RolePermissionRow> {
  const result = await getOne<RolePermissionRow>(
    `SELECT
      COALESCE(ARRAY_AGG(DISTINCT r.name), '{}') as roles,
      COALESCE(ARRAY_AGG(DISTINCT p.name), '{}') as permissions
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    JOIN role_permissions rp ON r.id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = $1
    GROUP BY ur.user_id`,
    [userId]
  );

  return result || { roles: [], permissions: [] };
}