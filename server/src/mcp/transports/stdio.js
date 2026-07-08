// MCP stdio transport
// 用法：node bin/mcp-server.js
//      或：npm run mcp:stdio
//
// ⚠️ 所有日志必须写到 stderr（stdout 会被 MCP 客户端解析为 JSON-RPC）

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from '../index.js';

const server = buildMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp-stdio] ready · tools: wbs_generate, wbs_extract_text, wbs_validate, wbs_stats');
