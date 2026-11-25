import { Router } from 'express';
import { checkDbHealth } from '../services/transcriptions.service.js';

const router = Router();

router.get('/', async (_req, res) => {
  const dbUp = await checkDbHealth();

  res.json({
    status: 'ok',
    db: dbUp ? 'up' : 'down',
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
