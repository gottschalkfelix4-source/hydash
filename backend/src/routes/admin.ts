import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

// All admin routes require authentication and user.manage permission
router.use(requireAuth, requirePermission('user.manage'));

// Users
router.get('/users', adminController.listUsers);
router.get('/users/:id', adminController.getUser);
router.patch('/users/:id/active', adminController.setUserActive);
router.delete('/users/:id', adminController.deleteUser);

// Roles
router.get('/roles', adminController.listRoles);
router.post('/roles', adminController.createRole);
router.patch('/roles/:id/permissions', adminController.updateRolePermissions);
router.delete('/roles/:id', adminController.deleteRole);

// User-Role assignments
router.post('/users/:userId/roles/:roleId', adminController.assignRole);
router.delete('/users/:userId/roles/:roleId', adminController.removeRole);

// Permissions
router.get('/permissions', adminController.listPermissions);

export default router;