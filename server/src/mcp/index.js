// MCP Server 工厂：构建并注册全部工具
// 同时供 stdio 模式（bin/mcp-server.js）和 HTTP+SSE 模式（transports/http.js）复用

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { register as registerGenerate } from './tools/wbsGenerate.js';
import { register as registerExtract } from './tools/wbsExtractText.js';
import { register as registerValidate } from './tools/wbsValidate.js';
import { register as registerStats } from './tools/wbsStats.js';
import { register as registerSkillList } from './tools/wbsSkillList.js';

export const SERVER_INFO = {
  name: 'sow-wbs-mcp',
  version: '1.0.0',
  description: 'SOW→WBS MCP Server：让大模型直接调用 WBS 分解、抽取、校验等能力',
  tools: ['wbs_generate', 'wbs_extract_text', 'wbs_validate', 'wbs_stats', 'wbs_skill_list', 'wbs_skill_read'],
};

export function buildMcpServer() {
  const server = new McpServer({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
  });

  registerGenerate(server);
  registerExtract(server);
  registerValidate(server);
  registerStats(server);
  registerSkillList(server);   // ← 新增（同时注册 wbs_skill_list 与 wbs_skill_read）

  return server;
}

export function mcpServerInfo() {
  return SERVER_INFO;
}
