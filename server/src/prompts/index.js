// ⭐ v2.20: 把 prompts/*.md 注册成可索引的「PMO Skill 库」
// 这样 MCP 工具 wbs_skill_list / wbs_skill_read 才能让外部 LLM 自己挑模板。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.join(__dirname);

/**
 * 内置 skill 元数据（注册表）
 * 选择哪个 skill 由 wbsService 决定（rule-based）；MCP 把这张表暴露给模型做"skill 浏览"。
 *
 * 各字段含义：
 *  - id          ：外部标识（与文件名去后缀保持一致）
 *  - name        ：中文名
 *  - stage       ：触发阶段 / 适用场景（free text）
 *  - appliesWhen ：代码中的硬规则（外部 LLM 可参考这条决定是否建议使用）
 *  - file        ：文件路径（相对 PROMPTS_DIR）
 *  - size        ：字节（懒加载，列表不带正文）
 *  - notes       ：用该模板时要注意的事情（截断 / 预算 / 上下文长度等）
 */
export const SKILLS = [
  {
    id: 'wbs-skeleton-prompt',
    name: 'WBS 骨架生成（阶段 1）',
    stage: '阶段 1：生成 L1-L3 骨架（meta + lifecyclePhases + wbs[].L1-L3 + milestones + requirements + rtm）',
    appliesWhen:
      '大 SOW（≥3000 字符）默认走它；输出体积小（≈ 3-5K tokens），避免截断；每个 L3 子节点留空，由阶段 2 展开',
    file: 'wbs-skeleton-prompt.md',
    notes: [
      '本阶段只产出 L1-L3，L3 的 children 为空数组',
      '若 LLM 输出被截断（finishReason=length），会自动回退到 wbs-master-prompt',
      '建议将本 skill 与 wbs-l4l5-prompt 配合使用（两阶段）',
    ],
  },
  {
    id: 'wbs-l4l5-prompt',
    name: 'WBS 展开（阶段 2 - L4/L5 叶子任务）',
    stage: '阶段 2：把骨架中的每个 L3 工作包展开为 L4-L5 叶子任务列表',
    appliesWhen:
      '骨架之后，每个 L3 调用一次。调用次数 = L3 节点数（典型 20-40 次），支持并发（默认 3）',
    file: 'wbs-l4l5-prompt.md',
    notes: [
      '每次只处理一个 L3，固定上下文（不超过 ~2K tokens 输出）',
      '若 SOW 很大或被 [TRIMMED] 截断，会从上下文池重新取相关章节',
      '失败的任务会保留在节点树并打 error，不影响其他 L3',
    ],
  },
  {
    id: 'wbs-master-prompt',
    name: 'WBS 一次性生成（单次模式 / 回退）',
    stage: '小 SOW 单次生成 OR 大 SOW 骨架被截断时的回退',
    appliesWhen:
      '① SOW < 3000 字符 → 一次性产出 L1-L5（grep1 路径）\n② 骨架阶段被截断 → 严格 6000 字预算的兜底',
    file: 'wbs-master-prompt.md',
    notes: [
      '单次模式要在 8000 字以内完成 L1-L5 全部分解',
      '回退模式只有 6000 字预算，只产出 L1-L3（children: []）',
      '强提示"只输出 JSON"，不要解释、不要 markdown 围栏',
    ],
  },
];

/**
 * 列出所有 skill（轻量列表，不带正文）
 */
export function listSkills() {
  return SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    stage: s.stage,
    appliesWhen: s.appliesWhen,
    file: s.file,
    notes: s.notes,
  }));
}

/**
 * 读出某个 skill 的内容。
 * @param {string} skillId
 * @param {{maxChars?:number, includeMetadata?:boolean}} opts
 */
export async function readSkill(skillId, opts = {}) {
  const meta = SKILLS.find((s) => s.id === skillId);
  if (!meta) {
    const e = new Error(`skill_not_found: ${skillId}`);
    e.code = 'skill_not_found';
    e.expose = true;
    throw e;
  }
  const fullPath = path.join(PROMPTS_DIR, meta.file);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const max = Number(opts.maxChars) || 0;
  const truncated = max > 0 && raw.length > max;
  const body = truncated ? raw.slice(0, max) + '\n\n[...TRUNCATED, use maxChars to view more...]' : raw;
  const out = {
    id: meta.id,
    name: meta.name,
    stage: meta.stage,
    file: meta.file,
    charCount: raw.length,
    body,
  };
  if (opts.includeMetadata !== false) {
    out.appliesWhen = meta.appliesWhen;
    out.notes = meta.notes;
  }
  return out;
}

/**
 * 路由表（id → 文件名）—— 供 wbsService 内核保持原样使用，不进 MCP
 */
export const SKILL_PATHS = SKILLS.reduce((acc, s) => {
  acc[s.id] = path.join(PROMPTS_DIR, s.file);
  return acc;
}, {});
