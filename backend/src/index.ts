import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { createServer } from 'http';

import logger from './utils/logger';
import { testConnection as testDbConnection, runMigrations } from './models/db';
import { connectRedis } from './models/redis';
import { initWebSocket } from './websocket/console';
import routes from './routes';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (behind nginx)
app.set('trust proxy', 1);

// ============================================
// Middleware
// ============================================

app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ============================================
// Routes
// ============================================

app.use('/api/v1', routes);

// Health check (outside rate limiting)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================
// Server Start
// ============================================

async function start() {
  try {
    logger.info('Starting HyDash API server...');

    // Connect to PostgreSQL
    logger.info('Connecting to PostgreSQL...');
    await testDbConnection(5, 2000);

    // Run migrations
    logger.info('Running database migrations...');
    await runMigrations();

    // Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();

    // Create HTTP server
    const server = createServer(app);

    // Initialize WebSocket server for live console
    initWebSocket(server);
    logger.info('WebSocket server initialized');

    // ============================================
    // Load Scheduled Tasks
    // ============================================
    try {
      const { loadScheduledTasks } = await import('./services/scheduledTaskService');
      await loadScheduledTasks();
    } catch (error) {
      logger.warn('Failed to load scheduled tasks:', error);
    }

    // ============================================
    // Cron Jobs
    // ============================================

    // Metrics collection: every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
      try {
        const { getMany } = await import('./models/db');
        const servers = await getMany<{ id: string; container_id: string; status: string }>(
          "SELECT id, container_id, status FROM servers WHERE status = 'running' AND container_id IS NOT NULL"
        );
        const { collectMetrics } = await import('./services/monitoringService');
        for (const server of servers) {
          try {
            await collectMetrics(server.id);
          } catch (err) {
            logger.debug(`Metrics collection failed for server ${server.id}:`, err);
          }
        }
      } catch (error) {
        logger.debug('Metrics collection cron error:', error);
      }
    });

    // Backup cleanup: daily at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        const { cleanupExpiredBackups, cleanupOldMetrics, cleanupOldLogs } = await import('./services/backupService');
        await cleanupExpiredBackups();
        await cleanupOldMetrics();
        await cleanupOldLogs();
        logger.info('Daily cleanup completed');
      } catch (error) {
        logger.error('Daily cleanup error:', error);
      }
    });

    // Auto-start servers on boot
    try {
      const { autostartServers } = await import('./services/serverService');
      await autostartServers();
    } catch (error) {
      logger.warn('Auto-start servers failed:', error);
    }

    // Start listening
    server.listen(PORT, () => {
      logger.info(`HyDash API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('All services initialized');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Stop scheduler
      try {
        const { default: scheduler } = await import('./utils/scheduler');
        scheduler.stopAll();
      } catch { /* ignore */ }

      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();