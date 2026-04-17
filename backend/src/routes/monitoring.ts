import { Router } from 'express';
import * as monitoringController from '../controllers/monitoringController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Overview endpoint: GET /monitoring/overview
router.get('/monitoring/overview', monitoringController.getMonitoringOverview);

// Server-scoped monitoring: GET /servers/:id/monitoring/current|history|health|logs
router.get('/servers/:id/monitoring/current', requirePermission('monitoring.view'), monitoringController.getCurrentMetrics);
router.get('/servers/:id/monitoring/history', requirePermission('monitoring.view'), monitoringController.getMetricsHistory);
router.get('/servers/:id/monitoring/health', requirePermission('monitoring.view'), monitoringController.getHealthAnalysis);
router.get('/servers/:id/monitoring/logs', requirePermission('monitoring.view'), monitoringController.getServerLogs);

export default router;