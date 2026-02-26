import { Router } from 'express';
import type { HealthResponse } from '../types.js';

const router = Router();
const VERSION = '1.0.0';

router.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    version: VERSION,
    uptime: Math.floor(process.uptime()),
  };
  res.json(body);
});

export default router;
