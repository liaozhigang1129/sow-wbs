// v1 API 统一错误处理
// 把所有 next(err) 收口成 {error: {code, message, details?}}
// 同时附带 reqId 用于日志关联
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.reqId = (typeof incoming === 'string' && incoming) || `v1-${randomUUID().slice(0, 8)}`;
  res.set('X-Request-Id', req.reqId);
  next();
}

export function errorMiddleware(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const code = err.code || 'internal_error';
  const message = err.message || '服务器内部错误';

  // 记录一条结构化日志
  console.error(`[v1][${req.reqId}][错误] ${status} ${code} - ${message}`,
    err.stack && status >= 500 ? `\n${err.stack}` : '');

  const body = { error: { code, message, requestId: req.reqId } };
  if (err.details) body.error.details = err.details;
  res.status(status).json(body);
}

// 工具：构造可被 errorMiddleware 处理的错误对象
export function httpError(status, code, message, details) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  if (details) e.details = details;
  e.expose = true;
  return e;
}
