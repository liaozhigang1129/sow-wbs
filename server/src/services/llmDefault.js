// ⭐ v2.20: 系统默认 LLM 配置
// 提供给 wbsService 调用前的最后一层兜底——
// 让"没配置 .env、也没传 llm_config"的请求也能识别这是 hexai。
//
// 优先级链（自上而下，任一命中即停）：
//   1. 调用方 llmConfig 入参                ← 用户/前端/外部 Agent 主动传
//   2. 进程环境变量                          ← .env / process.env
//   3. 系统默认（硬编码）                    ← 仅作 last-resort baseUrl
//
// 注意：systemDefault 不包含 apiKey——
// 没 apiKey 就走 mock，**不会**偷偷发请求到 hexai。

// 硬编码兜底（只暴露 baseUrl + model，无 key）
export const SYSTEM_DEFAULT = Object.freeze({
  provider: 'claude_hexai',                                    // ⭐ 默认 hexai 协议
  baseUrl: 'https://crs.hexai.cn/api/v1',                       // ⭐ 系统默认 hexai
  model: 'claude-sonnet-4-20250514',                            // ⭐ 精确默认模型（可被 env / 入参覆盖）
});

// 该跑哪一段兜底的优先级链
const ENV_PROVIDER_ORDER = [
  // ① 调用方入参    -> cfgs[*].provider      (在 wbsService normalizeLLMConfig 里完成)
  // ② env           -> HEXAI_PROVIDER / LLM_DEFAULT_PROVIDER
  // ③ 系统默认      -> claude_hexai
];

const ENV_BASE_URL_MAP = {
  claude_hexai: process.env.HEXAI_BASE_URL || SYSTEM_DEFAULT.baseUrl,
  claude:       process.env.LLM_CLAUDE_BASE_URL || 'https://api.anthropic.com',
  openai:       process.env.LLM_OPENAI_BASE_URL || 'https://api.openai.com/v1',
};

const ENV_MODEL_MAP = {
  claude_hexai: process.env.HEXAI_MODEL      || SYSTEM_DEFAULT.model,
  claude:       process.env.LLM_CLAUDE_MODEL  || 'claude-sonnet-4-5',
  openai:       process.env.LLM_OPENAI_MODEL  || 'gpt-4o-mini',
};

/**
 * 把入参 cfg 规范化，填上遗漏的字段（按优先级：入参 > env > 系统默认）。
 * 注意：不会强制注入 apiKey——若全部为空则调用方需自行确认走 mock。
 *
 * @param {object} cfg 调用方传进来的 llm_config（可空）
 * @returns {object} 规范化后的 cfg（始终包含 provider/model/baseUrl；apiKey 可能为空）
 */
export function normalizeLLMConfig(cfg) {
  const raw = cfg && typeof cfg === 'object' ? cfg : {};
  // 1) provider：入参 > env > 系统默认
  const envProvider =
    process.env.HEXAI_PROVIDER ||
    process.env.LLM_DEFAULT_PROVIDER ||
    null;
  const provider = raw.provider || envProvider || SYSTEM_DEFAULT.provider;

  // 2) baseUrl：入参 > env map（按 provider）> 系统默认
  const baseUrl =
    raw.baseUrl ||
    ENV_BASE_URL_MAP[provider] ||
    SYSTEM_DEFAULT.baseUrl;

  // 3) model：入参 > env map（按 provider）> 系统默认
  const model =
    raw.model ||
    ENV_MODEL_MAP[provider] ||
    SYSTEM_DEFAULT.model;

  // 4) apiKey：任一来源命中即可
  const apiKey =
    raw.apiKey ||
    process.env.HEXAI_API_KEY ||
    process.env.LLM_CLAUDE_API_KEY ||
    process.env.LLM_OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';

  return { ...raw, provider, baseUrl, model, apiKey };
}

/**
 * 用于 Swagger/openapi 描述：「系统默认模型」是什么，一句话描述。
 */
export function systemDefaultDescription() {
  return [
    '系统默认配置（按优先级链）：',
    '  1) 用户在请求体里显式传入 llm_config',
    '  2) 服务端 .env：HEXAI_BASE_URL / HEXAI_API_KEY / HEXAI_MODEL 等',
    `  3) 系统硬编码兜底：provider=claude_hexai, baseUrl=${SYSTEM_DEFAULT.baseUrl}, model=${SYSTEM_DEFAULT.model}`,
    '',
    '注意：',
    '  - 系统默认只提供 baseUrl；apiKey 必须由调用方/env 提供',
    '  - 没有 apiKey 时不会强行发请求到外部，会自动降级到 mock 生成',
    '  - hexai 默认走 OpenAI 协议（POST .../chat/completions）',
  ].join('\n');
}

/**
 * 检查 cfg 是否完整可用（用于外部 A/B 测试拦截）
 */
export function isLLMConfigReady(cfg) {
  if (!cfg) return false;
  return !!(cfg.provider && cfg.baseUrl && cfg.model && cfg.apiKey);
}
