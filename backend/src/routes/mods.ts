import { Router } from 'express';
import * as modController from '../controllers/modController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Mod search and discovery
router.get('/servers/:id/mods/search', requirePermission('mod.install'), modController.searchMods);
router.get('/servers/:id/mods/featured', requirePermission('mod.install'), modController.getFeaturedMods);
router.get('/servers/:id/mods/:curseforgeId/files', requirePermission('mod.install'), modController.getModFiles);

// Installed mod management
router.get('/servers/:id/mods/installed', requirePermission('monitoring.view'), modController.listInstalledMods);
router.post('/servers/:id/mods/install', requirePermission('mod.install'), modController.installMod);
router.delete('/servers/:id/mods/:modId', requirePermission('mod.uninstall'), modController.uninstallMod);
router.post('/servers/:id/mods/:modId/update', requirePermission('mod.update'), modController.updateMod);
router.get('/servers/:id/mods/updates', requirePermission('monitoring.view'), modController.checkModUpdates);

export default router;