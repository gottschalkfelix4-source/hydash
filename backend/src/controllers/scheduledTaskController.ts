import { Request, Response } from 'express';
import * as taskService from '../services/scheduledTaskService';
import { createTaskSchema } from '../types';
import { ZodError } from 'zod';

export async function listTasks(req: Request, res: Response): Promise<void> {
  try {
    const tasks = await taskService.listTasks(req.params.id);
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getTask(req: Request, res: Response): Promise<void> {
  try {
    const task = await taskService.getTask(req.params.taskId);
    if (!task) {
      res.status(404).json({ success: false, error: 'Task not found' });
      return;
    }
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const data = createTaskSchema.parse(req.body);
    const task = await taskService.createTask(req.params.id, data);
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: error.errors });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const task = await taskService.updateTask(req.params.taskId, req.body);
    res.json({ success: true, data: task });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    await taskService.deleteTask(req.params.taskId);
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function enableTask(req: Request, res: Response): Promise<void> {
  try {
    const task = await taskService.enableTask(req.params.taskId);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function disableTask(req: Request, res: Response): Promise<void> {
  try {
    const task = await taskService.disableTask(req.params.taskId);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function executeTask(req: Request, res: Response): Promise<void> {
  try {
    const execution = await taskService.executeTask(req.params.taskId, 'manual');
    res.json({ success: true, data: execution });
  } catch (error) {
    if (error instanceof Error && error.message === 'Task not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getTaskExecutions(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const executions = await taskService.getTaskExecutions(req.params.taskId, limit);
    res.json({ success: true, data: executions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function chainTasks(req: Request, res: Response): Promise<void> {
  try {
    const task = await taskService.chainTasks(req.params.taskId, req.params.nextTaskId);
    res.json({ success: true, data: task });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}