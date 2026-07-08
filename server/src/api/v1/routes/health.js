// GET /api/v1/health   - 存活检查
// GET /api/v1/version  - 版本信息
import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sow-wbs-api',
    time: new Date().toISOString(),
    api_version: 'v1',
  });
});

export default router;
