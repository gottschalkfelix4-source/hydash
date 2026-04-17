import { Router } from 'express';
import authRoutes from './auth';
import settingsRoutes from './settings';
import adminRoutes from './admin';
import serverRoutes from './servers';
import monitoringRoutes from './monitoring';
import backupRoutes from './backups';
import scheduledTaskRoutes from './scheduledTasks';
import modRoutes from './mods';
import fileRoutes from './files';
import hytaleRoutes from './hytale';

const router = Router();

// Auth routes (public)
router.use('/auth', authRoutes);

// Settings routes (mixed public/admin)
router.use('/settings', settingsRoutes);

// Admin routes (admin only)
router.use('/admin', adminRoutes);

// Server routes (authenticated)
router.use('/servers', serverRoutes);

// Monitoring routes
router.use('/', monitoringRoutes);

// Backup routes
router.use('/', backupRoutes);

// Scheduled task routes
router.use('/', scheduledTaskRoutes);

// Mod routes
router.use('/', modRoutes);

// File manager routes
router.use('/', fileRoutes);

// Hytale integration routes
router.use('/', hytaleRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;