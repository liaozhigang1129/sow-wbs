// MCP HTTP+SSE transport（mount 到现有 Express 应用）
//   GET  /mcp/sse       → 建立 SSE 连接，返回 sessionId
//   POST /mcp/messages  → 客户端向指定 sessionId 投递 JSON-RPC 请求
//
// 可选鉴权：传 apiKey 后，会对 /mcp/sse 的请求头进行校验（Bearer / X-API-Key）。
// 注意：HTTP+SSE 模式下鉴权只发生在 SSE 握手阶段；POST 不需 key，靠 sessionId 维持会话。
//
// ⭐ 改名警告：MCP 1.x 主流客户端既支持 sse 也支持 streamableHttp。本文件实现经典的 SSE 模式。

import { randomUUID } from 'node:crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { buildMcpServer } from '../index.js';

const sessions = new Map(); // sessionId → { transport, server, heartbeat }

function isAuthorized(req, apiKey) {
  if (!apiKey) return true; // 不配置 → 开放（开发模式）
  const h = req.headers.authorization || '';
  const x = req.headers['x-api-key'];
  const provided =
    (h.startsWith('Bearer ') ? h.slice(7).trim() : null) ||
    (typeof x === 'string' ? x.trim() : null);
  return provided === apiKey;
}

export function mountMcpSse(app, { apiKey = null } = {}) {
  // GET /mcp/sse  - 客户端建立 SSE 连接
  app.get('/mcp/sse', async (req, res) => {
    if (!isAuthorized(req, apiKey)) {
      return res.status(401).json({
        error: { code: 'unauthorized', message: 'MCP API key 无效或缺失' },
      });
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // 心跳防止代理断开
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch { /* socket closed */ }
    }, 15_000);

    // 新会话：每次握手都创建一个新的 MCP Server 实例（无状态）
    const transport = new SSEServerTransport('/mcp/messages', res);
    const server = buildMcpServer();
    const sessionId = randomUUID();
    sessions.set(sessionId, { transport, server, heartbeat, res });

    transport.onclose = () => {
      clearInterval(heartbeat);
      sessions.delete(sessionId);
    };

    try {
      await server.connect(transport);
      console.error(`[mcp-sse] session ${sessionId} connected`);
    } catch (e) {
      console.error('[mcp-sse] connect error:', e);
      clearInterval(heartbeat);
      sessions.delete(sessionId);
      try { res.end(); } catch {}
    }

    req.on('close', () => {
      clearInterval(heartbeat);
      sessions.delete(sessionId);
    });
  });

  // POST /mcp/messages?sessionId=xxx
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const sess = sessions.get(sessionId);
    if (!sess) {
      return res.status(404).json({
        error: { code: 'no_session', message: '未知或已过期的 sessionId' },
      });
    }
    try {
      await sess.transport.handlePostMessage(req, res);
    } catch (e) {
      console.error('[mcp-sse] post error:', e);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'internal_error', message: e.message } });
      }
    }
  });

  console.error(`[mcp-sse] mounted at /mcp/sse (auth=${apiKey ? 'on' : 'off'})`);
}
