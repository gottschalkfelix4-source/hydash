import { Request, Response } from 'express';
import * as rbacService from '../services/rbacService';

// ============================================
// Users
// ============================================

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await rbacService.getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const users = await rbacService.getUsers();
    const user = users.find(u => u.id === id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function setUserActive(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      res.status(400).json({ success: false, error: 'isActive must be a boolean' });
      return;
    }
    await rbacService.setUserActive(id, isActive);
    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (id === req.user?.userId) {
      res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      return;
    }
    await rbacService.deleteUser(id);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ============================================
// Roles
// ============================================

export async function listRoles(req: Request, res: Response): Promise<void> {
  try {
    const roles = await rbacService.getRoles();
    res.json({ success: true, data: roles });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function createRole(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, permissionIds } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: 'Role name is required' });
      return;
    }
    const role = await rbacService.createRole(name, description, permissionIds);
    res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateRolePermissions(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      res.status(400).json({ success: false, error: 'permissionIds must be an array' });
      return;
    }
    await rbacService.updateRolePermissions(id, permissionIds);
    const role = await rbacService.getRoleById(id);
    res.json({ success: true, data: role });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  try {
    await rbacService.deleteRole(req.params.id);
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function assignRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId, roleId } = req.params;
    await rbacService.assignRole(userId, roleId);
    res.json({ success: true, message: 'Role assigned' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function removeRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId, roleId } = req.params;
    await rbacService.removeRole(userId, roleId);
    res.json({ success: true, message: 'Role removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ============================================
// Permissions
// ============================================

export async function listPermissions(req: Request, res: Response): Promise<void> {
  try {
    const permissions = await rbacService.getPermissions();
    res.json({ success: true, data: permissions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}