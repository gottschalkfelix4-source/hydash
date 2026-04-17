import { Router } from 'express';
import * as serverController from '../controllers/serverController';
import { requireAuth } from '../middleware/auth';
import { requirePermission, requireServerOwnerOrPermission } from '../middleware/rbac';

const router = Router();

// All server routes require authentication
router.use(requireAuth);

// List servers (filtered by membership)
router.get('/', serverController.listServers);

// Create server
router.post('/', requirePermission('server.create'), serverController.createServer);

// Get server details
router.get('/:id', requirePermission('monitoring.view'), serverController.getServer);

// Update server
router.put('/:id', requirePermission('server.configure'), serverController.updateServer);

// Delete server
router.delete('/:id', requirePermission('server.delete'), serverController.deleteServer);

// Server lifecycle
router.post('/:id/start', requirePermission('server.start'), serverController.startServer);
router.post('/:id/stop', requirePermission('server.stop'), serverController.stopServer);
router.post('/:id/restart', requirePermission('server.restart'), serverController.restartServer);

// Server config (Hytale config.json)
router.get('/:id/config', requirePermission('monitoring.view'), serverController.getServerConfig);
router.put('/:id/config', requirePermission('server.configure'), serverController.updateServerConfig);

// Sub-routes will be added in subsequent phases:
// router.use('/:id/mods', modRoutes);
// router.use('/:id/backups', backupRoutes);
// router.use('/:id/monitoring', monitoringRoutes);
// router.use('/:id/tasks', scheduledTaskRoutes);
// router.use('/:id/files', fileRoutes);

export default router;