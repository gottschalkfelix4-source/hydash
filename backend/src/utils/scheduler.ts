import cron from 'node-cron';
import logger from './logger';
import { acquireLock, releaseLock, RedisKeys } from '../models/redis';

interface ScheduledJob {
  taskId: string;
  cronExpression: string;
  task: () => Promise<void>;
  timezone: string;
  cronJob: cron.ScheduledTask | null;
}

class SchedulerEngine {
  private jobs: Map<string, ScheduledJob> = new Map();

  /**
   * Register a scheduled job
   */
  registerJob(taskId: string, cronExpression: string, task: () => Promise<void>, timezone: string = 'UTC'): void {
    // Remove existing job if it exists
    this.unregisterJob(taskId);

    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const cronJob = cron.schedule(cronExpression, async () => {
      await this.executeJob(taskId, task);
    }, {
      timezone,
      scheduled: true,
    });

    this.jobs.set(taskId, {
      taskId,
      cronExpression,
      task,
      timezone,
      cronJob,
    });

    logger.info(`Scheduled job registered: ${taskId} (${cronExpression} ${timezone})`);
  }

  /**
   * Unregister a scheduled job
   */
  unregisterJob(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job?.cronJob) {
      job.cronJob.stop();
    }
    this.jobs.delete(taskId);
    logger.info(`Scheduled job unregistered: ${taskId}`);
  }

  /**
   * Execute a job with distributed locking
   */
  private async executeJob(taskId: string, task: () => Promise<void>): Promise<void> {
    // Acquire distributed lock to prevent duplicate execution
    const lockKey = RedisKeys.taskLock(taskId);
    const lockValue = await acquireLock(lockKey, 60000); // 60 second TTL

    if (!lockValue) {
      logger.debug(`Job ${taskId} skipped - another instance is executing`);
      return;
    }

    try {
      logger.info(`Executing scheduled job: ${taskId}`);
      await task();
      logger.info(`Job ${taskId} completed successfully`);
    } catch (error) {
      logger.error(`Job ${taskId} failed:`, error);
    } finally {
      await releaseLock(lockKey, lockValue);
    }
  }

  /**
   * Execute a job manually (not on schedule)
   */
  async executeManual(taskId: string, task: () => Promise<void>): Promise<void> {
    logger.info(`Manually executing job: ${taskId}`);
    await task();
  }

  /**
   * Update a job's schedule
   */
  updateSchedule(taskId: string, cronExpression: string, timezone: string = 'UTC'): void {
    const job = this.jobs.get(taskId);
    if (!job) {
      throw new Error(`Job not found: ${taskId}`);
    }

    this.registerJob(taskId, cronExpression, job.task, timezone);
  }

  /**
   * Get all registered job IDs
   */
  getJobIds(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const [taskId, job] of this.jobs) {
      if (job.cronJob) {
        job.cronJob.stop();
      }
    }
    this.jobs.clear();
    logger.info('All scheduled jobs stopped');
  }
}

export const scheduler = new SchedulerEngine();
export default scheduler;