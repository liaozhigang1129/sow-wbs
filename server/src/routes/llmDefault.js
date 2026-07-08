// /api/llm-default - 返回系统兜底 LLM 配置（元信息，不含 apiKey）
// 用途：前端在用户没有手动配置 llmConfig 时，可询问后端「有没有可用兜底」
// 安全：绝不返回 apiKey 明文，只返回 apiKeyPresent（true/false）让前端知道能不能用
import express from 'express';
import { SYSTEM_DEFAULT, normalizeLLMConfig } from '../services/llmDefault.js';

const router = express.Router();

router.get('/', (_req, res) => {
  // 用空对象走一遍 normalize，能拿到 env 覆盖后的 baseUrl/model
  const cfg = normalizeLLMConfig({});
  const apiKeyPresent = !!cfg.apiKey;
  // 默认的"显示标签"，与客户端 PROVIDER_PRESETS.claude_hexai.label 保持一致
  const label =
    cfg.provider === 'claude_hexai'
      ? 'Claude Sonnet 4 (hexai 中转 / OpenAI 兼容)'
      : `${cfg.provider} / ${cfg.model}`;

  res.json({
    ok: true,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    label,
    apiKeyPresent, // 重要：让前端判断是否真能用
    source: {
      baseUrlFrom: process.env.HEXAI_BASE_URL ? 'env' : 'system-default',
      modelFrom: process.env.HEXAI_MODEL ? 'env' : 'system-default',
      apiKeyFrom: pickApiKeySource(),
    },
    // 帮助前端直接拼出完整提示
    hint: apiKeyPresent
      ? `系统已配置兜底：${label}（baseUrl=${cfg.baseUrl}）`
      : '系统未配置兜底 API Key，请到 .env 设置 HEXAI_API_KEY 或在 UI 手动填写',
  });
});

function pickApiKeySource() {
  if (process.env.HEXAI_API_KEY) return 'HEXAI_API_KEY';
  if (process.env.LLM_CLAUDE_API_KEY) return 'LLM_CLAUDE_API_KEY';
  if (process.env.ANTHROPIC_API_KEY) return 'ANTHROPIC_API_KEY';
  if (process.env.LLM_OPENAI_API_KEY) return 'LLM_OPENAI_API_KEY';
  if (process.env.OPENAI_API_KEY) return 'OPENAI_API_KEY';
  return null;
}

export default router;
