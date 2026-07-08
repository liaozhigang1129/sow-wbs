// MCP 工具：wbs_stats
// 纯遍历统计 WBS（不需要再调 LLM），适合"快速看一眼规模"。

import { z } from 'zod';
import { computeStats } from '../../services/wbsService.js';

export const name = 'wbs_stats';
export const description =
  '快速统计 WBS 节点规模：总节点数、各层级节点分布、最大深度、总工时、叶子节点数。' +
  '适用场景：想看一份 WBS 大概有多少个工作包、各层是否完整、是否符合"瀑布深度 5 / 敏捷深度 3"等约束。' +
  '无 LLM 调用，瞬时返回。';

export function register(server) {
  server.tool(
    name,
    description,
    {
      wbs: z.any().describe('WBS 对象（同 wbs_generate / wbs_validate）'),
    },
    async ({ wbs }) => {
      try {
        if (!wbs || typeof wbs !== 'object') {
          return errorResult('请提供 wbs 对象', 'wbs_required');
        }
        const stats = computeStats(wbs);
        return ok({ ok: true, stats });
      } catch (e) {
        return errorResult(e?.message || String(e), e?.code || 'internal_error');
      }
    },
  );
}

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
function errorResult(message, code) {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code, message } }, null, 2) }] };
}
