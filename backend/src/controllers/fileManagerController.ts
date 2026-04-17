import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { query, getOne } from '../models/db';
import logger from '../utils/logger';

const SERVER_DATA_DIR = process.env.SERVER_DATA_DIR || '/var/hydash/servers';

/**
 * List files in a server directory
 */
export async function listFiles(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const dirPath = req.query.path as string || '/';

    // Resolve the full path and prevent path traversal
    const serverPath = path.join(SERVER_DATA_DIR, serverId);
    const fullPath = path.resolve(serverPath, dirPath.startsWith('/') ? dirPath.slice(1) : dirPath);

    // Security: ensure path is within server directory
    if (!fullPath.startsWith(path.resolve(serverPath))) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(fullPath, entry.name);
        let size = 0;
        if (entry.isFile()) {
          try {
            const stat = await fs.stat(entryPath);
            size = stat.size;
          } catch { /* ignore */ }
        }
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size,
          path: path.join(dirPath, entry.name),
        };
      })
    );

    res.json({ success: true, data: files });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'Directory not found' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Read file content
 */
export async function readFileContent(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({ success: false, error: 'Path query parameter required' });
      return;
    }

    const serverPath = path.join(SERVER_DATA_DIR, serverId);
    const fullPath = path.resolve(serverPath, filePath.startsWith('/') ? filePath.slice(1) : filePath);

    if (!fullPath.startsWith(path.resolve(serverPath))) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    res.json({ success: true, data: { path: filePath, content } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Write file content
 */
export async function writeFileContent(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const { path: filePath, content } = req.body;

    if (!filePath || content === undefined) {
      res.status(400).json({ success: false, error: 'Path and content required' });
      return;
    }

    const serverPath = path.join(SERVER_DATA_DIR, serverId);
    const fullPath = path.resolve(serverPath, filePath.startsWith('/') ? filePath.slice(1) : filePath);

    if (!fullPath.startsWith(path.resolve(serverPath))) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    await fs.writeFile(fullPath, content, 'utf-8');
    res.json({ success: true, message: 'File saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Delete a file or directory
 */
export async function deleteFile(req: Request, res: Response): Promise<void> {
  try {
    const serverId = req.params.id;
    const filePath = req.query.path as string;

    if (!filePath) {
      res.status(400).json({ success: false, error: 'Path query parameter required' });
      return;
    }

    const serverPath = path.join(SERVER_DATA_DIR, serverId);
    const fullPath = path.resolve(serverPath, filePath.startsWith('/') ? filePath.slice(1) : filePath);

    if (!fullPath.startsWith(path.resolve(serverPath))) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true });
    } else {
      await fs.unlink(fullPath);
    }

    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}