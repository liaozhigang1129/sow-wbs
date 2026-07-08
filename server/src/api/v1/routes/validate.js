// POST /api/v1/wbs/validate
// 入参: { wbs }
// 出参: { errors, warnings, passed, coverage, stats }

import { Router } from 'express';
import { validateWBS } from '../../../utils/validator.js';
import { computeStats } from '../../../services/wbsService.js';
import { httpError } from '../middleware/error.js';

const router = Router();

router.post('/', (req, res, next) => {
  try {
    const { wbs } = req.body || {};
    if (!wbs || typeof wbs !== 'object') {
      throw httpError(400, 'wbs_required', '需要提供 wbs 对象');
    }
    const audit = validateWBS(wbs);
    const stats = computeStats(wbs);
    res.json({ ...audit, stats });
  } catch (e) { next(e); }
});

export default router;
