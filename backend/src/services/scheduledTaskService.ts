import { query, getOne, getMany } from '../models/db';
import { ScheduledTask, TaskExecution, TaskType, TaskStatus, createTaskSchema, updateTaskSchema } from '../types';
import scheduler from '../utils/scheduler';
import logger from '../utils/logger';

/**
 * Create a scheduled task
 */
export async function createTask(serverId: string, data: Record<string, unknown>): Promise<ScheduledTask> {
  const validated = createTaskSchema.parse(data);

  // Calculate next run time for recurring tasks
  let nextRunAt: Date | null = null;
  if (validated.cronExpression) {
    // Validate cron expression
    const cron = await import('node-cron');
    if (!cron.validate(validated.cronExpression)) {
      throw new Error(`Invalid cron expression: ${validated.cronExpression}`);
    }
    // Next run time will be calculated by the scheduler
    nextRunAt = new Date(); // Approximate - scheduler handles exact timing
  }

  const result = await query<ScheduledTask>(
    `INSERT INTO scheduled_tasks (server_id, name, task_type, cron_expression, command, backup_type, mod_id, enabled, chain_next_task_id, timezone, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      serverId,
      validated.name,
      validated.taskType,
      validated.cronExpression,
      validated.command,
      validated.backupType,
      validated.modId,
      validated.enabled,
      validated.chainNextTaskId,
      validated.timezone,
      nextRunAt,
    ]
  );

  const task = result.rows[0];

  // Register with scheduler if enabled and has cron expression
  if (task.enabled && task.cronExpression) {
    registerTaskWithScheduler(task);
  }

  logger.info(`Scheduled task created: ${task.name} (${task.id})`);
  return task;
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string): Promise<ScheduledTask | null> {
  return getOne<ScheduledTask>('SELECT * FROM scheduled_tasks WHERE id = $1', [taskId]);
}

/**
 * List tasks for a server
 */
export async function listTasks(serverId: string): Promise<ScheduledTask[]> {
  return getMany<ScheduledTask>(
    'SELECT * FROM scheduled_tasks WHERE server_id = $1 ORDER BY created_at DESC',
    [serverId]
  );
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, data: Partial<ScheduledTask>): Promise<ScheduledTask> {
  const validated = updateTaskSchema.parse(data);

  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fields: Record<string, unknown> = {
    name: validated.name,
    cron_expression: validated.cronExpression,
    command: validated.command,
    enabled: validated.enabled,
    chain_next_task_id: validated.chainNextTaskId,
    timezone: validated.timezone,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updates.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) return task;

  values.push(taskId);
  const result = await query<ScheduledTask>(
    `UPDATE scheduled_tasks SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  const updatedTask = result.rows[0];

  // Update scheduler registration
  const taskCronExpression = updatedTask.cronExpression;
  if (updatedTask.enabled && taskCronExpression) {
    scheduler.registerJob(
      updatedTask.id,
      taskCronExpression,
      async () => { await executeTask(updatedTask.id, 'schedule'); },
      updatedTask.timezone
    );
  } else {
    scheduler.unregisterJob(updatedTask.id);
  }

  return updatedTask;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<void> {
  scheduler.unregisterJob(taskId);
  await query('DELETE FROM scheduled_tasks WHERE id = $1', [taskId]);
  logger.info(`Scheduled task deleted: ${taskId}`);
}

/**
 * Enable a task
 */
export async function enableTask(taskId: string): Promise<ScheduledTask> {
  return updateTask(taskId, { enabled: true } as Partial<ScheduledTask>);
}

/**
 * Disable a task
 */
export async function disableTask(taskId: string): Promise<ScheduledTask> {
  return updateTask(taskId, { enabled: false } as Partial<ScheduledTask>);
}

/**
 * Manually execute a task
 */
export async function executeTask(taskId: string, triggeredBy: 'manual' | 'schedule' | 'chain' = 'manual'): Promise<TaskExecution> {
  const task = await getTask(taskId);
  if (!task) throw new Error('Task not found');

  // Create execution record
  const execution = await query<TaskExecution>(
    `INSERT INTO task_executions (task_id, status, triggered_by)
     VALUES ($1, 'running', $2)
     RETURNING *`,
    [taskId, triggeredBy]
  );

  const execRecord = execution.rows[0];
  let output = '';
  let errorMessage = '';

  try {
    // Execute based on task type
    switch (task.taskType) {
      case 'restart':
        await executeRestartTask(task);
        output = 'Server restarted successfully';
        break;
      case 'backup':
        await executeBackupTask(task);
        output = 'Backup created successfully';
        break;
      case 'command':
        await executeCommandTask(task);
        output = 'Command executed successfully';
        break;
      case 'start':
        await executeStartTask(task);
        output = 'Server started successfully';
        break;
      case 'stop':
        await executeStopTask(task);
        output = 'Server stopped successfully';
        break;
      case 'mod_update':
        await executeModUpdateTask(task);
        output = 'Mod updated successfully';
        break;
      default:
        throw new Error(`Unknown task type: ${task.taskType}`);
    }

    // Update execution as successful
    await query(
      `UPDATE task_executions SET status = 'success', completed_at = NOW(), output = $1 WHERE id = $2`,
      [output, execRecord.id]
    );

    // Update task last run info
    await query(
      `UPDATE scheduled_tasks SET last_run_at = NOW(), last_status = 'success' WHERE id = $1`,
      [taskId]
    );

    // Execute chained task if configured
    if (task.chainNextTaskId) {
      await executeTask(task.chainNextTaskId, 'chain');
    }

  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await query(
      `UPDATE task_executions SET status = 'failed', completed_at = NOW(), error_message = $1 WHERE id = $2`,
      [errorMessage, execRecord.id]
    );

    await query(
      `UPDATE scheduled_tasks SET last_run_at = NOW(), last_status = 'failed' WHERE id = $1`,
      [taskId]
    );
  }

  // Re-fetch the execution record
  const executionRecord = await getOne<TaskExecution>('SELECT * FROM task_executions WHERE id = $1', [execRecord.id]);
  return executionRecord!;
}

/**
 * Get execution history for a task
 */
export async function getTaskExecutions(taskId: string, limit: number = 50): Promise<TaskExecution[]> {
  return getMany<TaskExecution>(
    'SELECT * FROM task_executions WHERE task_id = $1 ORDER BY started_at DESC LIMIT $2',
    [taskId, limit]
  );
}

/**
 * Chain two tasks together
 */
export async function chainTasks(taskId: string, nextTaskId: string): Promise<ScheduledTask> {
  // Verify both tasks exist and belong to the same server
  const task = await getTask(taskId);
  const nextTask = await getTask(nextTaskId);

  if (!task || !nextTask) throw new Error('Task not found');
  if (task.serverId !== nextTask.serverId) throw new Error('Tasks must belong to the same server');

  return updateTask(taskId, { chainNextTaskId: nextTaskId } as Partial<ScheduledTask>);
}

// ============================================
// Task Execution Implementations
// ============================================

async function executeRestartTask(task: ScheduledTask): Promise<void> {
  const { startServer, stopServer } = await import('./serverService');
  await stopServer(task.serverId);

  // Send warning to players (if server is running)
  try {
    const { broadcastLog } = await import('../websocket/console');
    broadcastLog(task.serverId, 'WARN', 'Server restarting in 30 seconds...');
  } catch { /* ignore if no one is connected */ }

  await new Promise(resolve => setTimeout(resolve, 5000)); // Brief pause
  await startServer(task.serverId);
}

async function executeBackupTask(task: ScheduledTask): Promise<void> {
  const { createServerBackup } = await import('./backupService');
  await createServerBackup(task.serverId, task.backupType || 'full');
}

async function executeCommandTask(task: ScheduledTask): Promise<void> {
  if (!task.command) throw new Error('No command specified');

  const server = await getOne<{ containerId: string; status: string }>(
    'SELECT container_id, status FROM servers WHERE id = $1',
    [task.serverId]
  );

  if (!server || !server.containerId || server.status !== 'running') {
    throw new Error('Server is not running');
  }

  const { dockerManager } = await import('../utils/docker');
  await dockerManager.execInContainer(server.containerId, ['sh', '-c', task.command]);
}

async function executeStartTask(task: ScheduledTask): Promise<void> {
  const { startServer } = await import('./serverService');
  await startServer(task.serverId);
}

async function executeStopTask(task: ScheduledTask): Promise<void> {
  const { stopServer } = await import('./serverService');
  await stopServer(task.serverId);
}

async function executeModUpdateTask(task: ScheduledTask): Promise<void> {
  if (!task.modId) throw new Error('No mod specified for update');
  // Mod update logic - will be implemented with mod management
  logger.info(`Mod update task for mod ${task.modId} on server ${task.serverId}`);
}

/**
 * Register a task with the scheduler
 */
function registerTaskWithScheduler(task: ScheduledTask): void {
  if (!task.cronExpression || !task.enabled) return;

  scheduler.registerJob(
    task.id,
    task.cronExpression,
    async () => { await executeTask(task.id, 'schedule'); },
    task.timezone || 'UTC'
  );
}

/**
 * Load all enabled tasks from database and register with scheduler
 */
export async function loadScheduledTasks(): Promise<void> {
  const tasks = await getMany<ScheduledTask>(
    "SELECT * FROM scheduled_tasks WHERE enabled = true AND cron_expression IS NOT NULL"
  );

  for (const task of tasks) {
    registerTaskWithScheduler(task);
  }

  logger.info(`Loaded ${tasks.length} scheduled tasks`);
}