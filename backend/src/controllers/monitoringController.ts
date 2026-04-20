import { Request, Response } from 'express';
import * as monitoringService from '../services/monitoringService';

export async function getCurrentMetrics(req: Request, res: Response): Promise<void> {
  try {
    const metrics = await monitoringService.getCurrentMetrics(req.params.id);
    if (!metrics) {
      res.json({ success: true, data: null, message: 'Server not running or no metrics available' });
      return;
    }
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getMetricsHistory(req: Request, res: Response): Promise<void> {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const metrics = await monitoringService.getMetricsHistory(req.params.id, hours);
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getHealthAnalysis(req: Request, res: Response): Promise<void> {
  try {
    const health = await monitoringService.analyzeHealth(req.params.id);
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getServerLogs(req: Request, res: Response): Promise<void> {
  try {
    const limit = parseInt(req.query.limit as string) || 500;
    const { getMany } = await import('../models/db');
    const logs = await getMany(
      'SELECT * FROM server_logs WHERE server_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [req.params.id, limit]
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getMonitoringOverview(req: Request, res: Response): Promise<void> {
  try {
    const overview = await monitoringService.getMonitoringOverview(
      req.user!.userId,
      req.user!.roles
    );
    res.json({ success: true, data: overview });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getSystemInfo(req: Request, res: Response): Promise<void> {
  try {
    const systemInfo = await monitoringService.getSystemInfo();
    res.json({ success: true, data: systemInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}