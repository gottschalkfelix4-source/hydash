import { Request, Response } from 'express';
import * as backupService from '../services/backupService';

export async function listBackups(req: Request, res: Response): Promise<void> {
  try {
    const backups = await backupService.listBackups(req.params.id);
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function createBackup(req: Request, res: Response): Promise<void> {
  try {
    const { backupType, retentionDays } = req.body;
    const backup = await backupService.createServerBackup(
      req.params.id,
      backupType || 'full',
      retentionDays || 14
    );
    res.status(201).json({ success: true, data: backup });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function restoreBackup(req: Request, res: Response): Promise<void> {
  try {
    await backupService.restoreServerBackup(req.params.id);
    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function deleteBackup(req: Request, res: Response): Promise<void> {
  try {
    await backupService.deleteBackup(req.params.id);
    res.json({ success: true, message: 'Backup deleted' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Backup not found') {
      res.status(404).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}