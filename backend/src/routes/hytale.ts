import { Router } from 'express';
import * as hytaleAuthService from '../services/hytaleAuthService';
import * as hytaleSetupService from '../services/hytaleSetupService';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Setup wizard - starts device code flow automatically
router.post('/servers/:id/setup/start', async (req, res) => {
  try {
    const result = await hytaleSetupService.startSetup(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/servers/:id/setup/status', async (req, res) => {
  try {
    const status = await hytaleSetupService.getSetupStatus(req.params.id);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/servers/:id/ready', async (req, res) => {
  try {
    const ready = await hytaleSetupService.isServerReady(req.params.id);
    res.json({ success: true, data: { ready } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Device code auth - start new flow
router.post('/servers/:id/auth/device-code', async (req, res) => {
  try {
    const result = await hytaleAuthService.startDeviceCodeFlow(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Poll for auth completion
router.post('/servers/:id/auth/poll', async (req, res) => {
  try {
    const result = await hytaleAuthService.pollDeviceAuth(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get current auth state
router.get('/servers/:id/auth/state', async (req, res) => {
  try {
    const state = await hytaleAuthService.getAuthState(req.params.id);
    res.json({ success: true, data: state });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Store OAuth credentials from frontend (after browser-based device code auth)
router.post('/servers/:id/auth/credentials', async (req, res) => {
  try {
    const { accessToken, refreshToken, expiresAt } = req.body;
    if (!accessToken) {
      res.status(400).json({ success: false, error: 'accessToken is required' });
      return;
    }
    await hytaleAuthService.storeCredentialsFromFrontend(req.params.id, {
      accessToken,
      refreshToken: refreshToken || undefined,
      expiresAt: expiresAt || Math.floor(Date.now() / 1000 + 3600),
      tokenType: 'bearer',
    });
    res.json({ success: true, message: 'Credentials stored' });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Download server files (starts in background)
router.post('/servers/:id/download', async (req, res) => {
  try {
    const result = await hytaleSetupService.continueAfterAuth(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Version check
router.get('/servers/:id/update-check', async (req, res) => {
  try {
    const version = await hytaleSetupService.getHytaleVersion();
    res.json({ success: true, data: { version } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;