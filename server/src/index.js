// SOW → WBS 系统后端入口
// v2.19: 新增 /api/v1/* 公开 API + /mcp/sse, /mcp/messages MCP 端点
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

import generateRouter from './routes/generate.js';
import uploadRouter from './routes/upload.js';
import exportRouter from './routes/export.js';
import validateRouter from './routes/validate.js';
import testLLMRouter from './routes/testLLM.js';
import mockGenerateRouter from './routes/mockGenerate.js';
import expandL3Router from './routes/expandL3.js';
import llmDefaultRouter from './routes/llmDefault.js';

import { buildV1Router } from './api/v1/router.js';
import { mcpServerInfo } from './mcp/index.js';
import { mountMcpSse } from './mcp/transports/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⭐ v2.20: 显式读取项目根目录 .env（index.js 在 server/src/，默认 dotenv 找不到根目录 .env）
const ROOT = path.join(__dirname, '..', '..');
dotenvConfig({ path: path.join(ROOT, '.env') });
const DIST = path.join(ROOT, 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ 内部 / 旧 API（保留兼容现有前端） ============
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/upload', uploadRouter);
app.use('/api/generate', generateRouter);
app.use('/api/validate', validateRouter);
app.use('/api/export', exportRouter);
app.use('/api/test-llm', testLLMRouter);
app.use('/api/mock-generate', mockGenerateRouter);
app.use('/api/expand-l3', expandL3Router);
app.use('/api/llm-default', llmDefaultRouter);

// ============ v2.19: 公开 REST API v1 ============
app.use('/api/v1', buildV1Router({ mcpServerInfo }));

// ============ v2.19: MCP (HTTP+SSE) ============
mountMcpSse(app, { apiKey: process.env.MCP_API_KEY || null });

// ============ 前端托管 ============
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api|mcp).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send(
      '<h1>SOW→WBS 后端已启动</h1>' +
      '<p>v1 API: <a href="/api/v1/docs">/api/v1/docs</a> · <a href="/api/v1/openapi.json">openapi.json</a></p>' +
      '<p>MCP (HTTP+SSE): <code>GET /mcp/sse</code> → <code>POST /mcp/messages?sessionId=...</code></p>' +
      '<p>MCP (stdio): <code>node bin/mcp-server.js</code></p>' +
      '<p>前端未构建。请先运行 <code>npm run build:client</code> 或开发模式 <code>npm run dev</code></p>',
    );
  });
}

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 SOW→WBS Server ready at http://${HOST}:${PORT}`);
  console.log(`   🔓 内部 API (旧):     POST /api/upload · /api/generate · /api/validate · /api/export · /api/test-llm`);
  console.log(`                         POST /api/expand-l3   ⭐ v3.0 按需展开单个 L3`);
  console.log(`   📘 公开 API v1:        GET  /api/v1/health`);
  console.log(`                         GET  /api/v1/version`);
  console.log(`                         GET  /api/v1/docs       (Swagger UI)`);
  console.log(`                         GET  /api/v1/openapi.json`);
  console.log(`                         POST /api/v1/sow/extract        (multipart)`);
  console.log(`                         POST /api/v1/sow/extract/base64 (JSON)`);
  console.log(`                         POST /api/v1/wbs/generate`);
  console.log(`                         POST /api/v1/wbs/auto      (文件 → WBS)`);
  console.log(`                         POST /api/v1/wbs/validate`);
  console.log(`                         POST /api/v1/wbs/export    (xlsx|md|docx|json)`);
  console.log(`   🤖 MCP (HTTP+SSE):     GET  /mcp/sse`);
  console.log(`                         POST /mcp/messages?sessionId=xxx`);
  console.log(`   🤖 MCP (stdio):        node bin/mcp-server.js\n`);
});
