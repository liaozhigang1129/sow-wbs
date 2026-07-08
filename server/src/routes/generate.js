// /api/generate - 接收 SOW 文本 + LLM 配置 → 同步返回 WBS JSON
// ⭐ v2.17：同步执行 + 缺 apiKey 自动降级到 mock（基于 SOW 内容自适应）
import express from 'express';
import { generateWBS } from '../services/wbsService.js';
import { mockGenerateFromSOW } from '../services/mockService.js';

const router = express.Router();

router.post('/', async (req, res) => {
  const t0 = Date.now();
  const reqId = `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const { sowText, llmConfig, options = {} } = req.body || {};
    const provider = llmConfig?.provider || 'unknown';
    const model = llmConfig?.model || 'unknown';
    const sowLen = sowText?.length || 0;
    console.log(`[generate][${reqId}][请求] provider=${provider} model=${model} sowChars=${sowLen} apiKeyPresent=${!!llmConfig?.apiKey}`);

    if (!sowText || sowText.trim().length < 50) {
      console.log(`[generate][${reqId}][响应] 400 - sowText 内容过短或缺失`);
      return res.status(400).json({ error: 'sowText 内容过短或缺失（至少 50 字符）' });
    }

    if (!llmConfig?.apiKey || llmConfig.apiKey === '__system_default__') {
      // ⭐ v3.x: 占位符或空 → 视为"使用系统兜底"，按 provider 拉 env
      if (!llmConfig) llmConfig = {};
      if (llmConfig.apiKey === '__system_default__') llmConfig.apiKey = '';
      // ⭐ 兜底 baseUrl / model：使用 normalizeLLMConfig（入参 > env > 系统默认）
      try {
        const { normalizeLLMConfig } = await import('../services/llmDefault.js');
        const nd = normalizeLLMConfig(llmConfig);
        llmConfig.provider = nd.provider;
        llmConfig.baseUrl = nd.baseUrl;
        llmConfig.model = nd.model;
      } catch (e) {
        // normalize 失败不影响后续逻辑（仅 env 兜底）
        console.warn(`[generate][${reqId}][warn] normalizeLLMConfig 失败：${e.message}`);
      }
      const envMap = {
        openai: process.env.LLM_OPENAI_API_KEY || process.env.LLM_QWEN_API_KEY,
        claude: process.env.LLM_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
        claude_hexai: process.env.HEXAI_API_KEY || process.env.LLM_CLAUDE_API_KEY,
      };
      const fallback = envMap[llmConfig?.provider];

      if (fallback) {
        llmConfig.apiKey = fallback;
        // ⭐ v2.17：同时设置 baseUrl（hexai 真域名是 crs.hexai.cn，不是 api.hexai.cn）
        if (!llmConfig.baseUrl && process.env.HEXAI_BASE_URL) {
          llmConfig.baseUrl = process.env.HEXAI_BASE_URL;
        }
        console.log(`[generate][${reqId}][配置] 使用环境变量 fallback key: ${llmConfig?.provider}, baseUrl=${llmConfig.baseUrl}`);
      } else {
        // ⭐ v2.17：自动降级到 mock 生成器（基于 SOW 内容自适应）
        console.log(`[generate][${reqId}][降级] 无 API Key，自动降级到 mock 生成`);
        try {
          const result = mockGenerateFromSOW(sowText, {
            promptMode: options?.promptMode || 'flexible',
            enableL4L5: options?.enableL4L5 !== false,
          });
          const elapsed = Date.now() - t0;
          console.log(`[generate][${reqId}][响应] ✓ mock 同步 ${elapsed}ms, 顶层=${result.wbs?.wbs?.length}, errors=${result.audit?.errors?.length || 0}`);
          return res.json({
            ...result,
            mock: true,
            degraded: true,
            degradedReason: '无 API Key，已自动降级到 mock 生成（基于 SOW 内容自适应）',
          });
        } catch (mockErr) {
          console.error(`[generate][${reqId}][错误] mock fallback 失败:`, mockErr);
          return res.status(500).json({
            error: `降级 mock 生成失败：${mockErr.message}`,
            hint: '请到右上角 ⚙️ 填写 hexai API Key，或在 .env 设置 HEXAI_API_KEY 后重启服务',
          });
        }
      }
    }

    console.log(`[generate][${reqId}][处理] 开始调用 generateWBS...`);
    const result = await generateWBS({
      sowText,
      llmConfig,
      options: {
        ...options,
        enableCache: false,  // ⭐ v2.17：禁用缓存，保证每次都真实调用 LLM
        onLog: (entry) => {
          const tag = entry.level === 'warn' ? '⚠️' : entry.level === 'error' ? '❌' : '•';
          console.log(`[generate][${reqId}][日志] ${tag} [${entry.stage}] ${entry.msg}`);
        },
      },
    });
    console.log(`[generate][${reqId}][处理] generateWBS 调用完成`);

    const { wbs, audit, log, meta } = result;
    const topLevelCount = wbs?.wbs?.length || 0;
    const errorCount = audit?.errors?.length || 0;
    const warningCount = audit?.warnings?.length || 0;
    const duration = Date.now() - t0;

    console.log(`[generate][${reqId}][响应] ✓ ${duration}ms, 顶层节点=${topLevelCount}, errors=${errorCount}, warnings=${warningCount}`);
    res.json({ wbs, audit, log, meta });
  } catch (err) {
    const duration = Date.now() - t0;
    console.error(`[generate][${reqId}][错误] ✗ ${duration}ms`, err.stack || err);
    res.status(500).json({
      error: err.message || '生成失败',
      log: err.log || [],
      meta: err.meta || null,
    });
  }
});

export default router;