// SOW→WBS v1 公共配置（API key、限流参数等）
// 所有 v1 路由统一从这里读取配置。

/**
 * 从环境变量读取允许的 API key 集合
 *  - 配置方式：WBS_API_KEYS="key1,key2,key3"（用英文逗号分隔）
 *  - 留空 / 未配置 → 整个 v1 API 处于"无鉴权开放模式"（开发友好）
 *
 * 返回值：Set<string>，是否启用鉴权由 hasApiKeys() 判定
 */
export function getApiKeys() {
  const raw = (process.env.WBS_API_KEYS || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((k) => k.trim()).filter(Boolean));
}

export function hasApiKeys() {
  return getApiKeys().size > 0;
}

/**
 * 默认每分钟允许请求数（按 key 桶限流）
 * 可通过环境变量 WBS_RATE_LIMIT_PER_MIN 自定义
 */
export function getRateLimitPerMin() {
  const n = parseInt(process.env.WBS_RATE_LIMIT_PER_MIN || '60', 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
