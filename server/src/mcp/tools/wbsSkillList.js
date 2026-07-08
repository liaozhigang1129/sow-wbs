// MCP 工具：wbs_skill_list
// 让外部 LLM 知道"我们有哪些 PMO skill 可以挑着用"（按场景选模板）。
//
// 与 wbsGenerate 的关系：
//  - wbsGenerate 已经自动按 SOW 长度选择最合适的 skill
//  - wbs_skill_list 提供「skill 全景」，让 LLM 在生成前可以主动读正本
//  - 适合场景：模型想自定义两阶段拆分、对某个 prompt 做小调整后覆盖

import { z } from 'zod';
import { listSkills, readSkill, SKILLS } from '../../prompts/index.js';

export const name = 'wbs_skill_list';
export const description =
  '列出本服务暴露给 LLM 使用的「PMO Skill（提示词模板）」清单。\n\n' +
  '用途：当模型想要挑选 / 自定义 / 替换某个 WBS 生成阶段所用提示词时，调此工具查看当前有哪些注册 skill。' +
  '通常 wbs_generate 会自动选择合适的 skill，本工具仅在模型想干预选择时被调用。\n\n' +
  '返回字段：id / name / stage / appliesWhen / notes / file。' +
  '读取正文请调用 wbs_skill_read。';

const ListSchema = {
  stage_filter: z
    .enum(['all', 'skeleton', 'l4l5', 'master'])
    .optional()
    .default('all')
    .describe(
      '仅返回对应阶段的 skill。all=全部；skeleton=阶段1；l4l5=阶段2；master=单次/回退',
    ),
};

export function register(server) {
  server.tool(
    name,
    description,
    ListSchema,
    async ({ stage_filter = 'all' }) => {
      try {
        let skills = listSkills();
        if (stage_filter !== 'all') {
          // 按 id 直接匹配（保证 stage_filter=master 能命中 master-prompt）
          skills = skills.filter((s) => s.id.includes(stage_filter));
        }
        return ok({
          ok: true,
          total: SKILLS.length,
          matched: skills.length,
          filter: stage_filter,
          skills,
          hint:
            '调用 wbs_skill_read(skill_id="<id>") 取正文，正文可能被 maxChars 截断。',
        });
      } catch (e) {
        return errorResult(e?.message || String(e), e?.code || 'internal_error');
      }
    },
  );

  // ===== 顺便注册配套的 "读正文" 工具 =====
  server.tool(
    'wbs_skill_read',
    '读取某个 PMO skill 提示词模板的正文（Markdown）。' +
      '适合模型想要看完整 prompt / 自定义覆盖 / 调风格时调用。' +
      'maxChars=0（默认）返回全文；>0 表示截断前 N 字符（带尾部省略标记）。',
    {
      skill_id: z
        .string()
        .describe(
          'skill 标识符（从 wbs_skill_list 返回的 id 字段复制）。例如 "wbs-skeleton-prompt"',
        ),
      max_chars: z
        .number()
        .int()
        .min(0)
        .max(60000)
        .optional()
        .default(0)
        .describe(
          '正文最大返回字符数。0=全文（可能很大）；5000=截断前 5000 字符并附 TRUNCATED 提示。',
        ),
      include_metadata: z
        .boolean()
        .optional()
        .default(true)
        .describe('是否同时返回 appliesWhen / notes 元信息（默认 true）'),
    },
    async ({ skill_id, max_chars, include_metadata }) => {
      try {
        const result = await readSkill(skill_id, {
          maxChars: max_chars,
          includeMetadata: include_metadata,
        });
        return ok({ ok: true, ...result });
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
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: false, error: { code, message } }, null, 2),
      },
    ],
  };
}
