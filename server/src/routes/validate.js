// /api/validate - 接收 WBS JSON → 返回校验结果
import express from 'express';
import { validateWBS } from '../utils/validator.js';

const router = express.Router();

router.post('/', (req, res) => {
  const t0 = Date.now();
  const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const { wbs } = req.body || {};
    const topLevelCount = wbs?.wbs?.length || 0;
    
    console.log(`[validate][${reqId}][请求] 顶层节点数=${topLevelCount}`);
    
    if (!wbs) {
      console.log(`[validate][${reqId}][响应] 400 - 缺少 wbs`);
      return res.status(400).json({ error: '缺少 wbs' });
    }
    
    console.log(`[validate][${reqId}][处理] 开始校验 WBS...`);
    const audit = validateWBS(wbs);
    console.log(`[validate][${reqId}][处理] 校验完成`);
    
    const errorCount = audit?.errors?.length || 0;
    const warningCount = audit?.warnings?.length || 0;
    const duration = Date.now() - t0;
    
    console.log(`[validate][${reqId}][响应] ✓ ${duration}ms, errors=${errorCount}, warnings=${warningCount}`);
    res.json(audit);
  } catch (err) {
    const duration = Date.now() - t0;
    console.error(`[validate][${reqId}][错误] ✗ ${duration}ms`, err.stack || err);
    res.status(500).json({ error: err.message });
  }
});

export default router;