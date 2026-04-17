import { Router } from 'express';
import * as fileController from '../controllers/fileManagerController';
import { requireAuth, requirePermission } from '../middleware/auth';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();

router.use(requireAuth);

router.get('/servers/:id/files', requirePermission('server.configure'), fileController.listFiles);
router.get('/servers/:id/files/content', requirePermission('server.configure'), fileController.readFileContent);
router.put('/servers/:id/files/content', requirePermission('server.configure'), fileController.writeFileContent);
router.delete('/servers/:id/files', requirePermission('server.delete'), fileController.deleteFile);
router.post('/servers/:id/files/upload', requirePermission('server.configure'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }
    const path = require('path');
    const fs = require('fs/promises');
    const serverId = req.params.id;
    const destPath = req.body.path || '/';
    const serverDataDir = process.env.SERVER_DATA_DIR || '/var/hydash/servers';
    const serverPath = path.join(serverDataDir, serverId);
    const fullPath = path.resolve(serverPath, destPath.startsWith('/') ? destPath.slice(1) : destPath);
    const filePath = path.join(fullPath, req.file.originalname);

    await fs.mkdir(fullPath, { recursive: true });
    await fs.writeFile(filePath, req.file.buffer);

    res.json({ success: true, message: 'File uploaded', data: { path: filePath } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;