// v1 API 简单内存限流（令牌桶）
// 按"key 或 IP"维度做桶；可通过环境变量 WBS_RATE_LIMIT_PER_MIN 调整每分钟上限
// 单进程假设（足够本项目使用）。集群模式需替换为 Redis。

import { getRateLimitPerMin } from '../config.js';

const buckets = new Map(); // id → { tokens, refillAt }
const IDLE_SWEEP_MS = 60 * 60 * 1000; // 1 小时不活跃的桶会回收

function gcSweep() {
  const now = Date.now();
  for (const [id, b] of buckets) {
    if (now - b.refillAt > IDLE_SWEEP_MS) buckets.delete(id);
  }
}
let gcTimer = setInterval(gcSweep, 10 * 60 * 1000).unref?.();

function tooMany(code, message) {
  const e = new Error(message || code);
  e.status = 429;
  e.code = code;
  e.expose = true;
  return e;
}

export function rateLimit() {
  const perMinute = getRateLimitPerMin();
  return (req, res, next) => {
    const id = req.apiKey || `ip:${req.ip || 'unknown'}`;
    const now = Date.now();
    const b = buckets.get(id) || { tokens: perMinute, refillAt: now };
    const elapsedMin = Math.max(0, (now - b.refillAt) / 60_000);
    b.tokens = Math.min(perMinute, b.tokens + elapsedMin * perMinute);
    b.refillAt = now;

    if (b.tokens < 1) {
      res.set('Retry-After', '60');
      return next(tooMany('rate_limited', `请求过于频繁（每分钟 ${perMinute} 次）`));
    }
    b.tokens -= 1;
    buckets.set(id, b);
    // 在响应头中暴露剩余配额（方便客户端调试）
    res.set('X-RateLimit-Limit', String(perMinute));
    res.set('X-RateLimit-Remaining', String(Math.floor(b.tokens)));
    next();
  };
}

// 导出供测试使用
export const __test__ = { buckets, gcSweep };
