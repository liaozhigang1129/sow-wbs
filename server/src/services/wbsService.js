// 两阶段 WBS 生成服务：骨架生成 + L4-L5 分阶段展开
// 彻底解决大 SOW 输出超 max_tokens 截断问题
//
// 阶段 1：生成骨架（L1-L3 + 顶层字段）→ 输出 ≤ 8K tokens
// 阶段 2：遍历所有 L3 → 单个 LLM 调用展开为 L4-L5（每次 ≤ 2K tokens）
//          支持并发（最多 4 个并发）
//
// 关键节点全程日志（skeleton/expand/merge/validate）

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLMFull, extractJSON, tryRepairTruncatedJSON } from './llm.js';
import { validateWBS } from '../utils/validator.js';
import { truncateForLLM } from '../utils/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKELETON_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-skeleton-prompt.md');
const L4L5_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-l4l5-prompt.md');
const MASTER_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-master-prompt.md');

function ts() {
  return new Date().toISOString().split('T')[1].slice(0, 12);
}

/**
 * 主入口：两阶段生成 WBS
 */
export async function generateWBS({ sowText, llmConfig, options = {} }) {
  const {
    l4l5Concurrency = 3,
    l4l5BatchSize = 8,
    enableL4L5 = true,
    enableValidation = true,
    enableSelfHealing = true,
  } = options;

  const log = [];
  const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });

  push('info', 'start', `🚀 开始两阶段生成 WBS，模型=${llmConfig.provider}/${llmConfig.model}`, {
    sowChars: sowText.length,
    enableL4L5,
    l4l5Concurrency,
  });

  // 阶段 1：骨架生成
  const skeleton = await generateSkeleton({ sowText, llmConfig, log, push });

  if (!enableL4L5) {
    push('info', 'skip.l4l5', '⏭️ 跳过 L4-L5 展开阶段（仅返回骨架）');
    return await buildResult(skeleton, null, log, push, {
      enableValidation,
      enableSelfHealing,
      sowText,
      llmConfig,
      parseMethod: 'skeleton-only',
    });
  }

  // 阶段 2：L4-L5 分阶段展开
  const enrichedSkeleton = await expandAllL3ToL4L5({
    log,
    push,
    skeleton,
    sowText,
    llmConfig,
    concurrency: l4l5Concurrency,
    batchSize: l4l5BatchSize,
  });

  return await buildResult(skeleton, enrichedSkeleton, log, push, {
    enableValidation,
    enableSelfHealing,
    sowText,
    llmConfig,
    parseMethod: 'two-stage',
  });
}

/**
 * 阶段 1：生成 L1-L3 骨架
 */
async function generateSkeleton({ sowText, llmConfig, log, push }) {
  push('info', 'skeleton.start', '📐 阶段 1：生成 L1-L3 骨架');

  const promptTemplate = await fs.readFile(SKELETON_PROMPT_PATH, 'utf-8');
  const truncated = truncateForLLM(sowText);
  push('info', 'skeleton.prompt', `📝 骨架 Prompt 已组装，注入 SOW ${truncated.length}/${sowText.length} 字符`);

  const userPrompt = `${promptTemplate}\n\n## SOW 内容\n\n\`\`\`\n${truncated}\n\`\`\``;

  push('info', 'skeleton.call', '📡 调用 LLM 生成骨架');
  const resp = await callLLMFull(llmConfig, userPrompt, log);

  let skeleton;
  try {
    skeleton = extractJSON(resp.text);
    push('info', 'skeleton.ok', `✓ 骨架生成成功：${countNodes(skeleton.wbs)} 个顶层节点`);
  } catch (err) {
    push('warn', 'skeleton.fail', `⚠️ 骨架解析失败：${err.message.slice(0, 120)}`);
    const repaired = tryRepairTruncatedJSON(resp.text);
    if (repaired) {
      skeleton = repaired;
      push('warn', 'skeleton.repaired', '🔧 骨架自动��补成功');
    } else if (resp.truncated || isLikelyTruncated(resp.text)) {
      push('warn', 'skeleton.fallback', '↩️ 骨架阶段被截断，回退到完整 prompt');
      return await fallbackToFullPrompt({ sowText, llmConfig, log, push });
    } else {
      throw new Error(`骨架生成失败：${err.message}\n原始片段: ${resp.text.slice(0, 500)}`);
    }
  }

  return skeleton;
}

/**
 * 回退方案
 */
async function fallbackToFullPrompt({ sowText, llmConfig, log, push }) {
  const promptTemplate = await fs.readFile(MASTER_PROMPT_PATH, 'utf-8');
  const truncated = truncateForLLM(sowText);
  const compactPrompt = `${promptTemplate}\n\n## SOW 内容\n\n\`\`\`\n${truncated}\n\`\`\`\n\n---\n\n## ⚠️ 重要：输出预算极严\n\n**总字符预算 ≤ 6000 字**：\n\n1. 每个节点 ≤ 80 字\n2. L3 节点 children 留空 []\n3. deliverable ≤ 10 字\n4. milestones ≤ 4 个\n5. requirements ≤ 8 条\n6. rtm ≤ 10 行\n\n只输出 JSON。`;

  const resp = await callLLMFull(llmConfig, compactPrompt, log);
  let skeleton;
  try {
    skeleton = extractJSON(resp.text);
    push('info', 'skeleton.fallback.ok', '✓ 回退方案骨架生成成功');
  } catch (err) {
    const repaired = tryRepairTruncatedJSON(resp.text);
    if (repaired) {
      skeleton = repaired;
      push('warn', 'skeleton.fallback.repaired', '🔧 回退方案自动修补成功');
    } else {
      throw new Error(`回退方案失败：${err.message}`);
    }
  }
  return skeleton;
}

/**
 * 阶段 2：遍历所有 L3 并发展开为 L4-L5
 */
async function expandAllL3ToL4L5({ log, push, skeleton, sowText, llmConfig, concurrency, batchSize }) {
  push('info', 'expand.start', `🔍 阶段 2：扫描所有 L3 工作包`);

  const l3List = collectL3Nodes(skeleton.wbs || []);
  push('info', 'expand.scan', `📋 发现 ${l3List.length} 个 L3 工作包`);

  if (l3List.length === 0) {
    push('warn', 'expand.empty', '⚠️ 未发现任何 L3，跳过展开');
    return skeleton;
  }

  const sowContextMap = buildSowContextMap(sowText);

  const results = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < l3List.length; i += batchSize) {
    const batch = l3List.slice(i, i + batchSize);
    push('info', 'expand.batch', `📦 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(l3List.length / batchSize)}（${batch.length} 个 L3）`);

    const promises = batch.map((l3) =>
      expandSingleL3({
        log,
        push,
        l3,
        sowContext: getSowContextForL3(l3, sowContextMap, sowText),
        llmConfig,
      })
        .then((expanded) => {
          results.push({ l3, expanded, ok: true });
          completed++;
        })
        .catch((err) => {
          push('warn', 'expand.fail', `❌ L3 ${l3.code} "${l3.name}" 展开失败：${err.message.slice(0, 100)}`);
          results.push({ l3, expanded: null, ok: false, error: err.message });
          failed++;
        }),
    );

    await pLimitAll(promises, concurrency);
  }

  push('info', 'expand.done', `✅ 阶段 2 完成：${completed} 成功 / ${failed} 失败`, {
    total: l3List.length,
    success: completed,
    failed,
  });

  return mergeExpandedIntoSkeleton(skeleton, results, push);
}

/**
 * 单个 L3 → L4-L5 展开
 */
async function expandSingleL3({ log, push, l3, sowContext, llmConfig }) {
  const promptTemplate = await fs.readFile(L4L5_PROMPT_PATH, 'utf-8');

  const userPrompt = promptTemplate
    .replace('{{L3_CODE}}', l3.code)
    .replace('{{L3_NAME}}', l3.name)
    .replace('{{L3_HOURS}}', String(l3.estimatedHours || 0))
    .replace('{{SOW_SECTION}}', l3.sowEvidence || 'N/A')
    .replace('{{L3_DELIVERABLE}}', l3.deliverable || 'N/A')
    .replace('{{L3_OWNER}}', l3.owner || 'PM')
    .replace('{{SOW_CONTEXT}}', sowContext || '（无相关 SOW 上下文，请基于工作包名称常识展开）');

  push('debug', 'expand.call', `📡 调用 LLM 展开 ${l3.code}`, {
    code: l3.code,
    name: l3.name,
    hours: l3.estimatedHours,
  });

  const resp = await callLLMFull(llmConfig, userPrompt, log);

  let expanded;
  try {
    expanded = extractJSON(resp.text);
  } catch (err) {
    const repaired = tryRepairTruncatedJSON(resp.text);
    if (repaired) {
      expanded = repaired;
      push('warn', 'expand.repaired', `🔧 ${l3.code} 自动修补成功`);
    } else if (resp.truncated || isLikelyTruncated(resp.text)) {
      push('warn', 'expand.retry', `↩️ ${l3.code} 被截断，重试（极简模式）`);
      const retryPrompt = userPrompt + '\n\n---\n\n⚠️ 上次被截断，请极简输出：\n- L4 ≤ 3 个，每个 L4 不拆 L5（直接叶子）\n- 每个节点 ≤ 60 字\n- 总字符 ≤ 1500';
      const resp2 = await callLLMFull(llmConfig, retryPrompt, log);
      try {
        expanded = extractJSON(resp2.text);
        push('info', 'expand.retry.ok', `✓ ${l3.code} 重试成功`);
      } catch (err2) {
        throw new Error(`重试仍失败：${err2.message.slice(0, 100)}`);
      }
    } else {
      throw new Error(`JSON 解析失败：${err.message.slice(0, 100)}`);
    }
  }

  if (!expanded || expanded.level !== 3 || !Array.isArray(expanded.children)) {
    throw new Error(`展开结果结构异常`);
  }

  return expanded;
}

/**
 * 合并展开结果到骨架
 */
function mergeExpandedIntoSkeleton(skeleton, results, push) {
  const cloned = JSON.parse(JSON.stringify(skeleton));
  const expandedMap = new Map();
  for (const r of results) {
    if (r.ok && r.expanded) expandedMap.set(r.l3.code, r.expanded);
  }

  const replaceL3Children = (nodes) => {
    for (const node of nodes) {
      if (node.level === 3 && expandedMap.has(node.code)) {
        const expanded = expandedMap.get(node.code);
        node.children = expanded.children || [];
        node.estimatedHours = sumChildrenHours(node);
      } else if (node.children?.length) {
        replaceL3Children(node.children);
      }
    }
  };

  replaceL3Children(cloned.wbs || []);

  push('info', 'merge.done', `🔗 已合并 ${expandedMap.size} 个 L3 的展开结果`);
  return cloned;
}

function collectL3Nodes(wbs) {
  const result = [];
  const walk = (nodes, path) => {
    for (const node of nodes || []) {
      const currentPath = path ? `${path} > ${node.name}` : node.name;
      if (node.level === 3) {
        result.push({
          code: node.code,
          name: node.name,
          level: 3,
          estimatedHours: node.estimatedHours || 0,
          deliverable: node.deliverable || '',
          owner: node.owner || '',
          sowEvidence: node.sowEvidence || '',
          path: currentPath,
        });
      } else if (node.children?.length) {
        walk(node.children, currentPath);
      }
    }
  };
  walk(wbs, '');
  return result;
}

function buildSowContextMap(sowText) {
  const map = new Map();
  const lines = sowText.split('\n');
  let currentSection = null;
  let buffer = [];

  for (const line of lines) {
    const match = line.match(/^(\d+(\.\d+)*)\s+/);
    if (match) {
      if (currentSection && buffer.length) {
        map.set(currentSection, buffer.join('\n').trim());
      }
      currentSection = match[1];
      buffer = [line];
    } else if (currentSection) {
      buffer.push(line);
    }
  }
  if (currentSection && buffer.length) {
    map.set(currentSection, buffer.join('\n').trim());
  }
  return map;
}

function getSowContextForL3(l3, sowContextMap, fullSowText) {
  const sectionMatch = (l3.sowEvidence || '').match(/(\d+(\.\d+)*)/);
  if (sectionMatch) {
    const section = sectionMatch[1];
    if (sowContextMap.has(section)) {
      return truncateContext(sowContextMap.get(section), 2000);
    }
  }
  return truncateContext(fullSowText, 2000);
}

function truncateContext(text, maxChars) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[... 中间省略 ...]\n\n${tail}`;
}

async function pLimitAll(promises, limit) {
  const executing = new Set();
  for (const p of promises) {
    const wrapped = p.finally(() => executing.delete(wrapped));
    executing.add(wrapped);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.allSettled(promises);
}

function isLikelyTruncated(text) {
  if (!text) return false;
  const trimmed = String(text).trim();
  const last = trimmed[trimmed.length - 1];
  if (last !== '}' && last !== ']') return true;
  const tail = trimmed.slice(-500);
  if (/抱歉.*截断|被截断|请缩短|续写|max_tokens/i.test(tail)) return true;
  let o = 0, c = 0;
  for (const ch of trimmed) {
    if (ch === '{') o++;
    else if (ch === '}') c++;
  }
  return o - c >= 2;
}

function countNodes(wbs) {
  let count = 0;
  const walk = (nodes) => {
    for (const n of nodes || []) {
      count++;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(wbs);
  return count;
}

function sumChildrenHours(node) {
  if (!node.children?.length) return node.estimatedHours || 0;
  return node.children.reduce((sum, c) => sum + (c.estimatedHours || sumChildrenHours(c)), 0);
}

/**
 * 构造最终结果
 */
async function buildResult(skeleton, enrichedSkeleton, log, push, opts = {}) {
  const wbs = enrichedSkeleton || skeleton;
  let audit = null;
  let parseWarning = null;
  const parseMethod = opts.parseMethod || (enrichedSkeleton ? 'two-stage' : 'skeleton-only');

  if (opts.enableValidation !== false) {
    push('info', 'validate', '🔍 执行工时守恒 + 命名规范校验');
    audit = validateWBS(wbs);
    push(
      audit.passed ? 'info' : 'warn',
      'validate.done',
      audit.passed
        ? `✓ 校验通过：${audit.stats.total} 节点 / ${audit.stats.totalHours}h`
        : `⚠️ 校验发现 ${audit.errors.length} 个错误 / ${audit.warnings.length} 个警告`,
      { passed: audit.passed, errorCount: audit.errors.length, warningCount: audit.warnings.length, stats: audit.stats },
    );
  }

  push('info', 'end', `🎉 生成完成（${parseMethod}）`, { parseMethod, totalLog: log.length });

  return {
    wbs,
    audit,
    log,
    meta: wbs.meta,
    parseMethod,
    parseWarning,
    summary: {
      parseMethod,
      totalNodes: audit?.stats?.total || countNodes(wbs.wbs),
      totalHours: audit?.stats?.totalHours || 0,
      l3Count: collectL3Nodes(wbs.wbs || []).length,
      valid: audit?.passed ?? null,
    },
  };
}
