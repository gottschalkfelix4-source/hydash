import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.get('/me', requireAuth, authController.getMe);
router.put('/me/profile', requireAuth, authController.updateProfile);
router.put('/me/password', requireAuth, authController.changePassword);
router.post('/api-key', requireAuth, authController.generateApiKey);

export default router;