import { Router } from 'express';
import * as backupController from '../controllers/backupController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Server-scoped backup routes
router.get('/servers/:id/backups', requirePermission('monitoring.view'), backupController.listBackups);
router.post('/servers/:id/backups', requirePermission('backup.create'), backupController.createBackup);

// Backup-specific routes
router.post('/backups/:id/restore', requirePermission('backup.restore'), backupController.restoreBackup);
router.delete('/backups/:id', requirePermission('backup.delete'), backupController.deleteBackup);

export default router;