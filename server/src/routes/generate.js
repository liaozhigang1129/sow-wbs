// /api/generate - 接收 SOW 文本 + LLM 配置 → 返回 WBS JSON
import express from 'express';
import { generateWBS } from '../services/wbsService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const t0 = Date.now();
  try {
    const { sowText, llmConfig } = req.body || {};
    console.log(`[generate] → provider=${llmConfig?.provider} model=${llmConfig?.model} sowChars=${sowText?.length}`);
    if (!sowText || sowText.trim().length < 50) {
      return res.status(400).json({ error: 'sowText 内容过短或缺失（至少 50 字符）' });
    }
    if (!llmConfig?.apiKey) {
      // 服务端 fallback：按 provider 推断 env key
      const envMap = {
        openai: process.env.LLM_OPENAI_API_KEY || process.env.LLM_QWEN_API_KEY,
        claude: process.env.LLM_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
        claude_hexai: process.env.HEXAI_API_KEY || process.env.LLM_CLAUDE_API_KEY,
      };
      const fallback = envMap[llmConfig?.provider];
      if (fallback) llmConfig.apiKey = fallback;
      else return res.status(400).json({ error: '缺少 API Key（请在前端"AI 配置"中填写，或设置 HEXAI_API_KEY 环境变量）' });
    }
    const result = await generateWBS({ sowText, llmConfig });
    const { wbs, audit, log, meta } = result;
    console.log(`[generate] ✓ ${Date.now() - t0}ms, 节点=${wbs?.wbs?.length} 个顶层`);
    res.json({ wbs, audit, log, meta });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({
      error: err.message || '生成失败',
      log: err.log || [],
    });
  }
});

export default router;