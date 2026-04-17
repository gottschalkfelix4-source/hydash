import { Request, Response } from 'express';
import * as settingsService from '../services/settingsService';
import * as curseforgeService from '../services/curseforgeService';

export async function getPublicSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await settingsService.getPublicSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getAdminSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await settingsService.getAdminSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await settingsService.updateSettings(req.body);

    // Sync CurseForge API key to the service if it was updated
    if (req.body.curseforgeApiKey !== undefined) {
      curseforgeService.setApiKey(req.body.curseforgeApiKey || '');
    }

    res.json({ success: true, data: settings });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}