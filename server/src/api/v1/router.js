// v1 路由聚合
// - 全部业务接口在鉴权 + 限流之内
// - 健康检查 / openapi.json / docs 不需要鉴权
import { Router } from 'express';
import { authMiddleware } from './middleware/auth.js';
import { rateLimit } from './middleware/rateLimit.js';
import { errorMiddleware, requestIdMiddleware } from './middleware/error.js';
import { openapiJson } from './openapi.js';
import { docsHtml } from './docsHtml.js';

import health from './routes/health.js';
import extract from './routes/extract.js';
import generate from './routes/generate.js';
import auto from './routes/auto.js';
import validateRoute from './routes/validate.js';
import exportRoute from './routes/export.js';
import skillsRoute from './routes/skills.js';

export function buildV1Router({ mcpServerInfo = null } = {}) {
  const r = Router();
  r.use(requestIdMiddleware);

  // 无需鉴权的元接口
  r.use('/health', health);
  r.get('/version', (_req, res) => {
    // 版本信息（避免依赖 health 路由的相对挂载）
    res.json({
      name: 'sow-wbs-api',
      version: '1.0.0',
      api_version: 'v1',
      description: 'SOW→WBS Public API + MCP Server',
    });
  });
  r.get('/openapi.json', (_req, res) => res.json(openapiJson()));
  r.get('/docs', (_req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(docsHtml);
  });
  if (mcpServerInfo) {
    r.get('/mcp/info', (_req, res) => res.json(mcpServerInfo));
  }

  // 鉴权 + 限流
  r.use('/sow/extract', authMiddleware, rateLimit(), extract);
  r.use('/wbs/generate', authMiddleware, rateLimit(), generate);
  r.use('/wbs/auto', authMiddleware, rateLimit(), auto);
  r.use('/wbs/validate', authMiddleware, rateLimit(), validateRoute);
  r.use('/wbs/export', authMiddleware, rateLimit(), exportRoute);
  r.use('/skill', authMiddleware, rateLimit(), skillsRoute);

  // 错误兜底
  r.use(errorMiddleware);
  return r;
}
