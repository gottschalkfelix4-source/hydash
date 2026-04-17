import { Router } from 'express';
import * as settingsController from '../controllers/settingsController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.get('/', settingsController.getPublicSettings);
router.get('/admin', requireAuth, requirePermission('user.manage'), settingsController.getAdminSettings);
router.put('/admin', requireAuth, requirePermission('user.manage'), settingsController.updateSettings);

export default router;