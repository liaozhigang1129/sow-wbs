// MCP 工具：wbs_validate
// 校验一个 WBS 对象的结构完整性与命名规范。

import { z } from 'zod';
import { validateWBS } from '../../utils/validator.js';
import { computeStats } from '../../services/wbsService.js';

export const name = 'wbs_validate';
export const description =
  '校验 WBS 对象的结构 / 命名规范 / 工时守恒 / 节点层级。' +
  '适用场景：调用 wbs_generate 后想确认是否规范、用户修改了 WBS 二次校验、批量校验多个项目。' +
  '返回 errors（致命问题）/ warnings（建议修订）/ passed（是否通过）/ coverage（覆盖率 0-1）/ stats（节点数 / 层级 / 总工时等）。';

export function register(server) {
  server.tool(
    name,
    description,
    {
      wbs: z.any().describe('待校验的 WBS 对象（与 wbs_generate 返回的 .wbs 字段同构）'),
    },
    async ({ wbs }) => {
      try {
        if (!wbs || typeof wbs !== 'object') {
          return errorResult('请提供 wbs 对象', 'wbs_required');
        }
        const audit = validateWBS(wbs);
        const stats = computeStats(wbs);
        return ok({ ok: true, audit, stats });
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
