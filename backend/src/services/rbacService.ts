import { query, getOne, getMany } from '../models/db';
import { Role, Permission } from '../types';

/**
 * Get all roles with their permissions
 */
export async function getRoles(): Promise<Role[]> {
  const roles = await getMany<{ id: string; name: string; isSystem: boolean; description: string | null }>(
    'SELECT id, name, is_system, description FROM roles ORDER BY is_system DESC, name'
  );

  const result: Role[] = [];
  for (const role of roles) {
    const permissions = await getMany<Permission>(
      `SELECT p.id, p.name, p.group_name as "groupName", p.description
       FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = $1
       ORDER BY p.group_name, p.name`,
      [role.id]
    );

    result.push({
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      description: role.description,
      permissions,
    });
  }

  return result;
}

/**
 * Get a single role by ID with permissions
 */
export async function getRoleById(roleId: string): Promise<Role | null> {
  const role = await getOne<{ id: string; name: string; isSystem: boolean; description: string | null }>(
    'SELECT id, name, is_system, description FROM roles WHERE id = $1',
    [roleId]
  );

  if (!role) return null;

  const permissions = await getMany<Permission>(
    `SELECT p.id, p.name, p.group_name as "groupName", p.description
     FROM permissions p
     JOIN role_permissions rp ON p.id = rp.permission_id
     WHERE rp.role_id = $1
     ORDER BY p.group_name, p.name`,
    [role.id]
  );

  return {
    id: role.id,
    name: role.name,
    isSystem: role.isSystem,
    description: role.description,
    permissions,
  };
}

/**
 * Create a custom role
 */
export async function createRole(name: string, description?: string, permissionIds?: string[]): Promise<Role> {
  const result = await query<{ id: string }>(
    'INSERT INTO roles (name, is_system, description) VALUES ($1, false, $2) RETURNING id',
    [name, description || null]
  );

  const roleId = result.rows[0].id;

  if (permissionIds && permissionIds.length > 0) {
    for (const permissionId of permissionIds) {
      await query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roleId, permissionId]
      );
    }
  }

  return (await getRoleById(roleId))!;
}

/**
 * Update a custom role's permissions
 */
export async function updateRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
  // Don't allow modifying system roles
  const role = await getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  if (role.isSystem) throw new Error('Cannot modify system roles');

  // Delete existing permissions
  await query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);

  // Insert new permissions
  for (const permissionId of permissionIds) {
    await query(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [roleId, permissionId]
    );
  }
}

/**
 * Delete a custom role (not system roles)
 */
export async function deleteRole(roleId: string): Promise<void> {
  const role = await getRoleById(roleId);
  if (!role) throw new Error('Role not found');
  if (role.isSystem) throw new Error('Cannot delete system roles');

  await query('DELETE FROM roles WHERE id = $1', [roleId]);
}

/**
 * Assign a role to a user
 */
export async function assignRole(userId: string, roleId: string): Promise<void> {
  await query(
    'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, roleId]
  );
}

/**
 * Remove a role from a user
 */
export async function removeRole(userId: string, roleId: string): Promise<void> {
  await query(
    'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
    [userId, roleId]
  );
}

/**
 * Get all available permissions
 */
export async function getPermissions(): Promise<Permission[]> {
  return getMany<Permission>(
    'SELECT id, name, group_name as "groupName", description FROM permissions ORDER BY group_name, name'
  );
}

/**
 * Get all users with their roles
 */
export async function getUsers() {
  return getMany<{
    id: string; email: string; displayName: string | null;
    isActive: boolean; createdAt: Date; roles: string[]
  }>(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.created_at,
     COALESCE(ARRAY_AGG(DISTINCT r.name), '{}') as roles
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     GROUP BY u.id, u.email, u.display_name, u.is_active, u.created_at
     ORDER BY u.created_at DESC`
  );
}

/**
 * Update user active status
 */
export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  await query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, userId]);
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}