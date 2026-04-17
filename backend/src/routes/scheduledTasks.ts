import { Router } from 'express';
import * as taskController from '../controllers/scheduledTaskController';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Server-scoped task routes
router.post('/servers/:id/tasks', requirePermission('task.create'), taskController.createTask);
router.get('/servers/:id/tasks', requirePermission('monitoring.view'), taskController.listTasks);

// Task-specific routes
router.get('/tasks/:taskId', requirePermission('monitoring.view'), taskController.getTask);
router.put('/tasks/:taskId', requirePermission('task.create'), taskController.updateTask);
router.delete('/tasks/:taskId', requirePermission('task.delete'), taskController.deleteTask);
router.post('/tasks/:taskId/enable', requirePermission('task.create'), taskController.enableTask);
router.post('/tasks/:taskId/disable', requirePermission('task.create'), taskController.disableTask);
router.post('/tasks/:taskId/execute', requirePermission('task.execute'), taskController.executeTask);
router.get('/tasks/:taskId/executions', requirePermission('monitoring.view'), taskController.getTaskExecutions);
router.post('/tasks/:taskId/chain/:nextTaskId', requirePermission('task.create'), taskController.chainTasks);

export default router;