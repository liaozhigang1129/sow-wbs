// v1 API 鉴权中间件
// - 支持 Authorization: Bearer <key> 和 X-API-Key: <key> 两种方式
// - 若 WBS_API_KEYS 未配置，则视为"开发模式"，所有请求放行（仅在日志中提示）
import { getApiKeys, hasApiKeys } from '../config.js';

function unauthorized(code, message) {
  const e = new Error(message || code);
  e.status = 401;
  e.code = code;
  e.expose = true;
  return e;
}

export function authMiddleware(req, _res, next) {
  // 如果没有配置任何 API key → 开发模式直接放行，并在请求日志中标记
  if (!hasApiKeys()) {
    req.apiKey = null;
    req.authMode = 'open';
    return next();
  }

  const header = req.headers.authorization || '';
  const xKey = req.headers['x-api-key'];
  const provided =
    (header.startsWith('Bearer ') ? header.slice(7).trim() : null) || (typeof xKey === 'string' ? xKey.trim() : null);

  if (!provided) return next(unauthorized('missing_api_key', '缺少 API Key：请在请求头提供 Authorization: Bearer <key> 或 X-API-Key'));

  const allowed = getApiKeys();
  if (!allowed.has(provided)) return next(unauthorized('invalid_api_key', 'API Key 无效'));

  req.apiKey = provided;
  req.authMode = 'key';
  next();
}
