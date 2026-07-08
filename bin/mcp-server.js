#!/usr/bin/env node
// MCP stdio 启动入口
// 配置示例见 README 或 docs/MCP.md
//   {
//     "mcpServers": {
//       "sow-wbs": {
//         "command": "node",
//         "args": ["/path/to/SOW_WBS 2/bin/mcp-server.js"],
//         "env": { "HEXAI_API_KEY": "sk-xxx", "HEXAI_BASE_URL": "https://crs.hexai.cn/v1" }
//       }
//     }
//   }
//
// 同时 import 'dotenv/config' 让 .env 自动加载（与原服务一致）

import 'dotenv/config';
import '../server/src/mcp/transports/stdio.js';
