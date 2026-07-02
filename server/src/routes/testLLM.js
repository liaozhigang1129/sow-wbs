// /api/test-llm - 测试 LLM 配置连通性
import express from 'express';
import { testLLM } from '../services/llm.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { llmConfig } = req.body || {};
    if (!llmConfig) return res.status(400).json({ ok: false, message: '缺少 llmConfig' });
    const result = await testLLM(llmConfig);
    res.json(result);
  } catch (err) {
    console.error('[test-llm]', err);
    res.status(500).json({ ok: false, message: err.message || '测试失败', latencyMs: 0 });
  }
});

export default router;