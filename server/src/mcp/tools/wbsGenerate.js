// MCP 工具：wbs_generate
// 入参：sow_text（≥50 字符），可选 prompt_mode / enable_l4l5 / llm_config
// 出参：完整 WBS JSON + 校验结果
//
// 与公开 API /api/v1/wbs/generate 共用 wrapService.js，确保行为一致。

import { z } from 'zod';
import { wrapGenerate } from '../util/wrapService.js';

const InputSchema = {
  sow_text: z.string().min(50, 'sow_text 必须 ≥ 50 字符').describe('SOW 全文（≥50 字符）。'),
  prompt_mode: z.enum(['strict', 'flexible']).optional().default('flexible')
    .describe('命名严格度。strict=严格使用 PMO 术语；flexible=灵活本地化。默认 flexble。'),
  enable_l4l5: z.boolean().optional().default(true)
    .describe('是否展开到 L4/L5 细节。false=仅 L1-L3 工作包（更快）。'),
  llm_provider: z.enum(['openai', 'claude', 'claude_hexai']).optional()
    .describe('LLM 提供商；缺省时用环境变量推断。'),
  llm_model: z.string().optional().describe('LLM 模型名（如 gpt-4o、claude-3-5-sonnet）。'),
};

export const name = 'wbs_generate';
export const description =
  '把 SOW（工作说明书）文本转成 WBS（工作分解结构）JSON。' +
  '适用场景：用户提供 / 上传 / 总结出 SOW 文本，并希望产出层级化交付物清单（阶段→交付物→工作包→子任务→叶子）。' +
  '返回的 wbs.wbs 是节点树，每节点含 code/name/level/estimatedHours/deliverable/owner/sowEvidence 等字段。' +
  '若服务端没有配置 LLM API Key，会自动降级到本地 mock 生成器（基于 SOW 内容自适应的层级骨架）。';

export function register(server) {
  server.tool(
    name,
    description,
    InputSchema,
    async ({ sow_text, prompt_mode, enable_l4l5, llm_provider, llm_model }) => {
      try {
        const llm_config = llm_provider ? { provider: llm_provider, model: llm_model } : null;
        const result = await wrapGenerate({
          sowText: sow_text,
          llmConfig: llm_config,
          options: { promptMode: prompt_mode, enableL4L5: enable_l4l5 },
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: true,
                  note: result.mock
                    ? '⚠️ 本次调用因服务端无 LLM Key，已自动降级到本地 mock 生成；结果为骨架级 WBS，非真实 LLM 输出。'
                    : '✅ 已通过 LLM 生成（' + (result?.meta?.provider || llm_provider || 'unknown') + '）',
                  ...result,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}

function errorResult(e) {
  const msg = e?.message || String(e);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error: { code: e?.code || 'internal_error', message: msg } }, null, 2),
      },
    ],
  };
}
