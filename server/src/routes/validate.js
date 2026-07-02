// /api/validate - 接收 WBS JSON → 返回校验结果
import express from 'express';
import { validateWBS } from '../utils/validator.js';

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const { wbs } = req.body || {};
    if (!wbs) return res.status(400).json({ error: '缺少 wbs' });
    const audit = validateWBS(wbs);
    res.json(audit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;