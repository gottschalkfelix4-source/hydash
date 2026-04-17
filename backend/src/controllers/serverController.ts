import { Request, Response } from 'express';
import * as serverService from '../services/serverService';
import { createServerSchema, updateServerSchema } from '../types';
import { ZodError } from 'zod';

/**
 * List servers
 */
export async function listServers(req: Request, res: Response): Promise<void> {
  try {
    const servers = await serverService.listServers(
      req.user!.userId,
      req.user!.roles
    );
    res.json({ success: true, data: servers });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get a single server
 */
export async function getServer(req: Request, res: Response): Promise<void> {
  try {
    const server = await serverService.getServer(req.params.id);
    if (!server) {
      res.status(404).json({ success: false, error: 'Server not found' });
      return;
    }
    res.json({ success: true, data: server });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Create a server
 */
export async function createServer(req: Request, res: Response): Promise<void> {
  try {
    const data = createServerSchema.parse(req.body);
    const server = await serverService.createServer(req.user!.userId, data);
    res.status(201).json({ success: true, data: server });
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

/**
 * Update a server
 */
export async function updateServer(req: Request, res: Response): Promise<void> {
  try {
    const data = updateServerSchema.parse(req.body);
    const server = await serverService.updateServer(req.params.id, data);
    res.json({ success: true, data: server });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({ success: false, error: error.errors });
      return;
    }
    if (error instanceof Error) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Delete a server
 */
export async function deleteServer(req: Request, res: Response): Promise<void> {
  try {
    await serverService.deleteServer(req.params.id);
    res.json({ success: true, message: 'Server deleted' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Server not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Start a server
 */
export async function startServer(req: Request, res: Response): Promise<void> {
  try {
    const server = await serverService.startServer(req.params.id);
    res.json({ success: true, data: server });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes('not found') ? 404 :
                    error.message.includes('already running') ? 409 : 500;
      res.status(status).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Stop a server
 */
export async function stopServer(req: Request, res: Response): Promise<void> {
  try {
    const server = await serverService.stopServer(req.params.id);
    res.json({ success: true, data: server });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes('not found') ? 404 :
                    error.message.includes('already stopped') ? 409 : 500;
      res.status(status).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Restart a server
 */
export async function restartServer(req: Request, res: Response): Promise<void> {
  try {
    const server = await serverService.restartServer(req.params.id);
    res.json({ success: true, data: server });
  } catch (error) {
    if (error instanceof Error) {
      const status = error.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Get server config.json
 */
export async function getServerConfig(req: Request, res: Response): Promise<void> {
  try {
    const config = await serverService.getServerConfig(req.params.id);
    res.json({ success: true, data: config });
  } catch (error) {
    if (error instanceof Error && error.message === 'Server not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Update server config.json
 */
export async function updateServerConfig(req: Request, res: Response): Promise<void> {
  try {
    const config = await serverService.updateServerConfig(req.params.id, req.body);
    res.json({ success: true, data: config });
  } catch (error) {
    if (error instanceof Error && error.message === 'Server not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}