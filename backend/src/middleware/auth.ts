import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { JwtPayload } from '../types';
import { getOne } from '../models/db';
import logger from '../utils/logger';

// Re-export for convenience
export { JwtPayload } from '../types';
export { requirePermission, requireRole, requireServerOwnerOrPermission, hasPermission, hasAnyPermission } from './rbac';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate access + refresh token pair
 */
export function generateTokenPair(payload: JwtPayload): TokenPair {
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);

  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN } as SignOptions
  );

  return { accessToken, refreshToken };
}

/**
 * Verify an access token and return the payload
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.substring(7);
}

/**
 * Extract token from query param (for WebSocket)
 */
function extractQueryToken(req: Request): string | null {
  return (req.query.token as string) || null;
}

/**
 * Middleware: Require authentication
 * Sets req.user with the decoded JWT payload
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req) || extractQueryToken(req);

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  // Check if user is still active
  getOne<{ isActive: boolean }>(
    'SELECT is_active FROM users WHERE id = $1',
    [payload.userId]
  ).then(user => {
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: 'User account is disabled' });
      return;
    }
    req.user = payload;
    next();
  }).catch(err => {
    logger.error('Auth middleware error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
}

/**
 * Middleware: Optional authentication
 * Sets req.user if token is present, but doesn't require it
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req) || extractQueryToken(req);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

/**
 * Middleware: API key authentication
 * Checks for X-API-Key header or api_key query param
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey) {
    next();
    return;
  }

  getOne<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE api_key = $1 AND is_active = true',
    [apiKey]
  ).then(user => {
    if (user) {
      // Get user roles and permissions
      getOne<{ roles: string[]; permissions: string[] }>(
        `SELECT
          ARRAY_AGG(DISTINCT r.name) as roles,
          ARRAY_AGG(DISTINCT p.name) as permissions
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1
        GROUP BY ur.user_id`,
        [user.id]
      ).then(rolesAndPerms => {
        req.user = {
          userId: user.id,
          email: user.email,
          roles: rolesAndPerms?.roles || [],
          permissions: rolesAndPerms?.permissions || [],
        };
        next();
      });
    } else {
      res.status(401).json({ success: false, error: 'Invalid API key' });
    }
  }).catch(err => {
    logger.error('API key auth error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });
}