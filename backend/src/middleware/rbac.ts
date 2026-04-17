import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../types';

/**
 * Middleware: Check if the authenticated user has the required permission
 * Must be used after requireAuth middleware
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const userPermissions = req.user.permissions || [];

    // Admin role has all permissions
    if (req.user.roles?.includes('admin')) {
      next();
      return;
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some(p => userPermissions.includes(p));
    if (!hasPermission) {
      res.status(403).json({
        success: false,
        error: `Permission denied. Required: ${permissions.join(' or ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Check if the authenticated user has ANY of the specified roles
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const hasRole = roles.some(r => req.user?.roles?.includes(r));
    if (!hasRole) {
      res.status(403).json({
        success: false,
        error: `Role denied. Required: ${roles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware: Check if user is the owner of the server or has admin/operator role
 */
export function requireServerOwnerOrPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    // Admin always has access
    if (req.user.roles?.includes('admin')) {
      next();
      return;
    }

    // Check if user has the required permission
    if (req.user.permissions?.includes(permission)) {
      next();
      return;
    }

    // Check if user is the server owner
    const serverId = req.params.id || req.params.serverId;
    if (serverId) {
      const { getOne } = await import('../models/db');
      const server = await getOne<{ ownerId: string }>(
        'SELECT owner_id FROM servers WHERE id = $1',
        [serverId]
      );

      if (server?.ownerId === req.user.userId) {
        next();
        return;
      }
    }

    res.status(403).json({ success: false, error: 'Access denied' });
  };
}

/**
 * Helper: Check if a user has a specific permission
 */
export function hasPermission(user: JwtPayload, permission: string): boolean {
  if (user.roles?.includes('admin')) return true;
  return user.permissions?.includes(permission) || false;
}

/**
 * Helper: Check if a user has any of the specified permissions
 */
export function hasAnyPermission(user: JwtPayload, ...permissions: string[]): boolean {
  if (user.roles?.includes('admin')) return true;
  return permissions.some(p => user.permissions?.includes(p));
}