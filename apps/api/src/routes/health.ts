import { Router } from 'express';

import { dbReady } from '../db/connect.js';

export const healthRouter = Router();

// Liveness: the process is up.
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: the process can serve traffic.
healthRouter.get('/ready', async (_req, res) => {
  const ok = await dbReady();
  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', mongodb: ok });
});
