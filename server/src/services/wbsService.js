// 两阶段 WBS 生成服务：骨架生成 + L4-L5 分阶段展开
// 彻底解决大 SOW 输出超 max_tokens 截断问题
//
// 阶段 1：生成骨架（L1-L3 + 顶层字段）→ 输出 ≤ 8K tokens
// 阶段 2：遍历所有 L3 → 单个 LLM 调用展开为 L4-L5（每次 ≤ 2K tokens）
//          支持并发（最多 4 个并发）
//
// 关键节点全程日志（skeleton/expand/merge/validate）

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLLMConfig, isLLMConfigReady, SYSTEM_DEFAULT } from './llmDefault.js';
import { callLLMFull, extractJSON, tryRepairTruncatedJSON } from './llm.js';
import { validateWBS } from '../utils/validator.js';
import { truncateForLLM } from '../utils/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKELETON_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-skeleton-prompt.md');
const L4L5_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-l4l5-prompt.md');
const MASTER_PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'wbs-master-prompt.md');

// ⭐ v2.16 优化 #8：小 SOW 阈值（字符数 < 此值走单次生成）
const SMALL_SOW_THRESHOLD = 3000;

// ⭐ v2.16 优化 #9：结果缓存（按 SOW hash + 模型 key）
const CACHE_MAX_SIZE = 20;             // 最多缓存 20 个结果（防内存泄漏）
const CACHE_TTL_MS = 30 * 60 * 1000;   // 30 分钟过期
const resultCache = new Map();         // key → { result, expiresAt }

/**
 * ⭐ v2.16 优化 #9：生成缓存 key（基于 SOW 内容 + 模型 + baseUrl）
 */
function buildCacheKey(sowText, llmConfig) {
  const hash = crypto.createHash('sha256');
  hash.update(sowText);
  hash.update('|');
  hash.update(llmConfig.provider || 'openai');
  hash.update('|');
  hash.update(llmConfig.model || 'default');
  hash.update('|');
  hash.update(llmConfig.baseUrl || '');
  return hash.digest('hex').slice(0, 32);
}

/**
 * ⭐ v2.16 优化 #9：从缓存读取（带过期检查 + 命中日志）
 */
function getFromCache(key, log, push) {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resultCache.delete(key);
    push?.('debug', 'cache.expired', '🕒 缓存已过期');
    return null;
  }
  push?.('info', 'cache.hit', `🎯 缓存命中，节省 ~${entry.result.log?.length || 0} 个 log 行`, { key, ageMs: Date.now() - (entry.expiresAt - CACHE_TTL_MS) });
  return entry.result;
}

/**
 * ⭐ v2.16 优化 #9：写入缓存（带 LRU 淘汰）
 */
function setToCache(key, result) {
  if (resultCache.size >= CACHE_MAX_SIZE) {
    const firstKey = resultCache.keys().next().value;
    resultCache.delete(firstKey);
  }
  resultCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

function ts() {
  return new Date().toISOString().split('T')[1].slice(0, 12);
}

/**
 * 主入口：两阶段生成 WBS
 */
export async function generateWBS({ sowText, llmConfig, options = {} }) {
  // ⭐ v2.20：先把 llmConfig 规范化（入参 > env > 系统默认 hexai）
  const normalized = normalizeLLMConfig(llmConfig);
  // 原地补全到传入对象（保证下游仍按 llmConfig.* 读取）
  if (llmConfig && typeof llmConfig === 'object') {
    Object.assign(llmConfig, {
      provider: normalized.provider,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
      apiKey: normalized.apiKey,
    });
  }
  const {
    l4l5Concurrency = 3,
    l4l5BatchSize = 8,
    enableL4L5 = true,
    enableValidation = true,
    enableSelfHealing = true,
    enableCache = true,        // ⭐ v2.16 优化 #9：可关闭缓存
    smallSowThreshold = SMALL_SOW_THRESHOLD,  // ⭐ v2.16 优化 #8：可自定义阈值
  } = options;

  const log = [];
  const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });

  push('info', 'start', `🚀 开始生成 WBS，模型=${llmConfig.provider}/${llmConfig.model} baseUrl=${llmConfig.baseUrl}`, {
    sowChars: sowText.length,
    enableL4L5,
    l4l5Concurrency,
    sowSize: sowText.length < smallSowThreshold ? 'small' : 'large',
    apiKeyReady: isLLMConfigReady(llmConfig),
    normalizedFrom: llmConfig?.__normalized ? 'inline' : 'default',
  });

  // ⭐ v2.16 优化 #9：先查缓存（命中则直接返回，不调 LLM）
  const cacheKey = enableCache ? buildCacheKey(sowText, llmConfig) : null;
  if (cacheKey) {
    const cached = getFromCache(cacheKey, log, push);
    if (cached) {
      push('info', 'cache.served', '✅ 返回缓存结果', { cacheKey });
      return { ...cached, fromCache: true };
    }
  }

  // ⭐ v2.16 优化 #8��小 SOW（< threshold 字符）走单次生成
  if (sowText.length < smallSowThreshold && enableL4L5) {
    push('info', 'small_sow', `📏 SOW 较短（${sowText.length} < ${smallSowThreshold}），走单次生成`, { sowChars: sowText.length });
    const result = await generateSingleShot({ sowText, llmConfig, log, push });
    if (cacheKey) setToCache(cacheKey, result);
    return result;
  }

  // 阶段 1：骨架生成
  const skeleton = await generateSkeleton({ sowText, llmConfig, log, push });

  // ⭐ v2.16 优化 #6：骨架失败后禁止进入展开阶段
  // 失败原因：fallback 失败时再调 N 次 LLM = 浪费 ~30-50s 和大量 token
  // 此时直接返回骨架（带错误日志），让前端展示错误而非无意义等待
  if (!skeleton) {
    push('error', 'skeleton.abort', '🛑 骨架生成失败，跳过 L4-L5 展开阶段，直接返回', {
      reason: 'skeleton 或 fallback 均失败',
    });
    const result = await buildResult({ wbs: [], meta: {}, requirements: [], rtm: [], lifecyclePhases: [], milestones: [] }, null, log, push, {
      enableValidation: false,
      enableSelfHealing: false,
      sowText,
      llmConfig,
      parseMethod: 'aborted',
    });
    if (cacheKey) setToCache(cacheKey, result);
    return result;
  }

  if (!enableL4L5) {
    push('info', 'skip.l4l5', '⏭️ 跳过 L4-L5 展开阶段（仅返回骨架）');
    const result = await buildResult(skeleton, null, log, push, {
      enableValidation,
      enableSelfHealing,
      sowText,
      llmConfig,
      parseMethod: 'skeleton-only',
    });
    if (cacheKey) setToCache(cacheKey, result);
    return result;
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

  const result = await buildResult(skeleton, enrichedSkeleton, log, push, {
    enableValidation,
    enableSelfHealing,
    sowText,
    llmConfig,
    parseMethod: 'two-stage',
  });

  // ⭐ v2.16 优化 #9：写缓存
  if (cacheKey) setToCache(cacheKey, result);
  return result;
}

/**
 * ⭐ v2.16 优化 #8：小 SOW 单次生成（直接用 master prompt 一次跑完）
 */
async function generateSingleShot({ sowText, llmConfig, log, push }) {
  push('info', 'single_shot.start', '🎯 单次生成模式（跳过两阶段）');

  const promptTemplate = await fs.readFile(MASTER_PROMPT_PATH, 'utf-8');
  const truncated = truncateForLLM(sowText);
  const compactPrompt = `${promptTemplate}\n\n## SOW 内容\n\n\`\`\`\n${truncated}\n\`\`\`\n\n---\n\n## ⚠️ 重要：小 SOW 单次模式\n\n由于 SOW 较短（< 3000 字符），请在**单次响应中输出完整 WBS**（含 L1-L5 全部节点），无需分阶段。\n\n1. 总字符预算 ≤ 8000 字\n2. 每个节点 ≤ 80 字\n3. 叶子节点交付物 ≤ 10 字\n4. milestones ≤ 4 个，requirements ≤ 8 条，rtm ≤ 10 行\n5. 只输出 JSON`;

  push('info', 'single_shot.call', '📡 调用 LLM 单次生成');
  const resp = await callLLMFull(llmConfig, compactPrompt, log);
  if (resp.usage) {
    push('info', 'llm.tokens.single_shot', `🧮 单次 Token: prompt=${resp.usage.prompt_tokens} completion=${resp.usage.completion_tokens} total=${resp.usage.total_tokens}`);
  }

  let wbs;
  try {
    wbs = extractJSON(resp.text);
    push('info', 'single_shot.ok', `✓ 单次生成成功`);
  } catch (err) {
    const repaired = tryRepairTruncatedJSON(resp.text);
    if (repaired) {
      wbs = repaired;
      push('warn', 'single_shot.repaired', '🔧 自动修补成功');
    } else {
      throw new Error(`单次生成失败：${err.message}\n原始片段: ${resp.text.slice(0, 500)}`);
    }
  }

  return await buildResult(wbs, null, log, push, {
    enableValidation: true,
    enableSelfHealing: true,
    sowText,
    llmConfig,
    parseMethod: 'single-shot',
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
  if (resp.usage) {
    push('info', 'llm.tokens.skeleton', `🧮 骨架 Token: prompt=${resp.usage.prompt_tokens} completion=${resp.usage.completion_tokens} total=${resp.usage.total_tokens}`);
  }

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
  if (resp.usage) {
    push('info', 'llm.tokens.fallback', `🧮 回退 Token: prompt=${resp.usage.prompt_tokens} completion=${resp.usage.completion_tokens} total=${resp.usage.total_tokens}`);
  }
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
  push('info', 'expand.config', `⚙️ 并发配置：concurrency=${concurrency} batchSize=${batchSize}`, { concurrency, batchSize });

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
  const totalBatches = Math.ceil(l3List.length / batchSize);
  const t0 = Date.now();

  for (let i = 0; i < l3List.length; i += batchSize) {
    const batch = l3List.slice(i, i + batchSize);
    const batchIdx = Math.floor(i / batchSize) + 1;
    const batchT0 = Date.now();
    push('info', 'expand.batch', `📦 处理批次 ${batchIdx}/${totalBatches}（${batch.length} 个 L3）`);

    // ⭐ v2.16 优化：记录批次实际并行启动数（实测最大并发）
    let activeInBatch = 0;
    let peakActive = 0;

    const promises = batch.map((l3) => {
      activeInBatch++;
      if (activeInBatch > peakActive) peakActive = activeInBatch;
      return expandSingleL3({
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
        })
        .finally(() => {
          activeInBatch--;
        });
    });

    await pLimitAll(promises, concurrency);

    const batchMs = Date.now() - batchT0;
    push('info', 'expand.batch.done', `✓ 批次 ${batchIdx}/${totalBatches} 完成，耗时 ${batchMs}ms（峰值并发 ${peakActive}）`, {
      batchIdx, batchMs, peakActive, concurrency,
    });
  }

  const expandTotalMs = Date.now() - t0;
  const avgPerL3 = l3List.length > 0 ? Math.round(expandTotalMs / l3List.length) : 0;
  push('info', 'expand.done', `✅ 阶段 2 完成：${completed} 成功 / ${failed} 失败`, {
    total: l3List.length,
    success: completed,
    failed,
    totalMs: expandTotalMs,
    avgPerL3Ms: avgPerL3,
    theoreticalSerialMs: avgPerL3 * l3List.length,
    concurrencyGain: avgPerL3 > 0 ? `${(avgPerL3 * l3List.length / expandTotalMs).toFixed(2)}x 加速` : 'N/A',
  });

  return mergeExpandedIntoSkeleton(skeleton, results, push);
}

/**
 * 单个 L3 → L4-L5 展开
 */
// ⭐ v2.16 优化 #10：截断重试使用独立极简 prompt
const COMPACT_RETRY_PROMPT = `# WBS L4-L5 极简重试模式（v2.16）

> 上次响应被截断，本次必须**极简输出**。
> 输入参数：L3 代码={{L3_CODE}} / 名称={{L3_NAME}} / 工时={{L3_HOURS}}h / 章节={{SOW_SECTION}}
> SOW 片段：{{SOW_CONTEXT}}

## 严格规则

- L4 数 ≤ 3 个，每个 L4 不拆 L5（直接叶子）
- 每个节点字段 ≤ 60 字
- **总字符 ≤ 1500 字**
- 严禁 markdown 围栏、寒暄、解释
- 必填字段：code/name/level/estimatedHours/owner/deliverable/sowEvidence/children
- owner 只能是：PM/BA/SA/Dev/QA/TL/DATA/AR/SR

## 输出（只输出 JSON）

{
  "code": "{{L3_CODE}}",
  "name": "{{L3_NAME}}",
  "level": 3,
  "estimatedHours": {{L3_HOURS}},
  "owner": "{{L3_OWNER}}",
  "deliverable": "{{L3_DELIVERABLE}}",
  "sowEvidence": "{{SOW_SECTION}}",
  "children": [
    {"code": "{{L3_CODE}}.1", "name": "子任务1", "level": 4, "estimatedHours": 8, "owner": "Dev", "deliverable": "交付1", "sowEvidence": "{{SOW_SECTION}}", "children": []},
    {"code": "{{L3_CODE}}.2", "name": "子任务2", "level": 4, "estimatedHours": 8, "owner": "Dev", "deliverable": "交付2", "sowEvidence": "{{SOW_SECTION}}", "children": []},
    {"code": "{{L3_CODE}}.3", "name": "子任务3", "level": 4, "estimatedHours": 8, "owner": "Dev", "deliverable": "交付3", "sowEvidence": "{{SOW_SECTION}}", "children": []}
  ]
}
`;

/**
 * ⭐ v2.16 优化 #12：owner 角色归一化映射
 * LLM 经常输出 PM/BA/SA/Dev/QA/TL/DATA/AR/SR 之外的角色（如 "Engineer"、"前端开发"）
 * 在 prompt 拼装前先归一化，避免产出非法 owner 值（触发 validator 警告）
 */
const OWNER_NORMALIZE_MAP = {
  // 大小写归一
  'pm': 'PM', 'ba': 'BA', 'sa': 'SA', 'qa': 'QA', 'tl': 'TL', 'ar': 'AR', 'sr': 'SR',
  'dev': 'Dev', 'data': 'DATA', 'pm': 'PM',
  // 别名映射
  'engineer': 'Dev', 'developer': 'Dev', '开发': 'Dev', '开发工程师': 'Dev',
  'architect': 'SA', '架构师': 'SA', '系统架构师': 'SA', '设计师': 'SA',
  'analyst': 'BA', 'analyst BA': 'BA', '业务分析': 'BA', '需求分析': 'BA',
  'tester': 'QA', '测试': 'QA', '测试工程师': 'QA',
  'tech lead': 'TL', '技术负责人': 'TL', 'lead': 'TL',
  'product manager': 'PM', '项目经理': 'PM', '管理': 'PM',
  'data engineer': 'DATA', 'data scientist': 'DATA', '数据': 'DATA', '数据工程师': 'DATA',
  'analyst researcher': 'AR', 'researcher': 'AR', '研究员': 'AR',
  'senior researcher': 'SR', '高级研究员': 'SR',
};

function normalizeOwner(raw) {
  if (!raw) return 'PM';
  const trimmed = String(raw).trim();
  // 直接命中合法池
  const validSet = new Set(['PM', 'BA', 'SA', 'Dev', 'QA', 'TL', 'DATA', 'AR', 'SR']);
  if (validSet.has(trimmed)) return trimmed;
  // 小写 / 关键词匹配
  const lower = trimmed.toLowerCase();
  if (OWNER_NORMALIZE_MAP[lower]) return OWNER_NORMALIZE_MAP[lower];
  // 中文包含关键词（首次命中胜出）
  for (const [key, value] of Object.entries(OWNER_NORMALIZE_MAP)) {
    if (trimmed.includes(key)) return value;
  }
  // 默认 PM（兜底）
  return 'PM';
}

// 导出供测试使用
export { normalizeOwner };

/**
 * ⭐ v3.0: 单个 L3 公开接口（供按需展开 API 使用）
 * 接收: l3 {code,name,estimatedHours,owner,deliverable,sowEvidence}
 *       sowContext: SOW 上下文文本
 *       llmConfig, log
 * 返回: 展开后的 L3（含 children L4-L5）
 */
export async function expandSingleL3Public({ l3, sowContext, llmConfig, log = [] }) {
  const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });
  return await expandSingleL3({ log, push, l3, sowContext, llmConfig });
}

async function expandSingleL3({ log, push, l3, sowContext, llmConfig }) {
  const promptTemplate = await fs.readFile(L4L5_PROMPT_PATH, 'utf-8');

  // ⭐ v2.16 优化 #12：归一化 owner（防止 LLM 输出非法值）
  const normalizedOwner = normalizeOwner(l3.owner);
  if (normalizedOwner !== l3.owner && l3.owner) {
    push('info', 'expand.owner.normalize', `🔄 owner 归一化：${l3.owner} → ${normalizedOwner}`, {
      from: l3.owner, to: normalizedOwner,
    });
  }

  const userPrompt = promptTemplate
    .replace('{{L3_CODE}}', l3.code)
    .replace('{{L3_NAME}}', l3.name)
    .replace('{{L3_HOURS}}', String(l3.estimatedHours || 0))
    .replace('{{SOW_SECTION}}', l3.sowEvidence || 'N/A')
    .replace('{{L3_DELIVERABLE}}', l3.deliverable || 'N/A')
    .replace('{{L3_OWNER}}', normalizedOwner)
    .replace('{{SOW_CONTEXT}}', sowContext || '（无相关 SOW 上下文，请基于工作包名称常识展开）');

  push('debug', 'expand.call', `📡 调用 LLM 展开 ${l3.code}`, {
    code: l3.code,
    name: l3.name,
    hours: l3.estimatedHours,
  });

  const resp = await callLLMFull(llmConfig, userPrompt, log);
  if (resp.usage) {
    push('info', 'llm.tokens.l3', `🧮 ${l3.code} "${l3.name}" Token: prompt=${resp.usage.prompt_tokens} completion=${resp.usage.completion_tokens} total=${resp.usage.total_tokens}`);
  }

  let expanded;
  try {
    expanded = extractJSON(resp.text);
  } catch (err) {
    const repaired = tryRepairTruncatedJSON(resp.text);
    if (repaired) {
      expanded = repaired;
      push('warn', 'expand.repaired', `🔧 ${l3.code} 自动修补成功`);
    } else if (resp.truncated || isLikelyTruncated(resp.text)) {
      push('warn', 'expand.retry', `↩️ ${l3.code} 被截断，使用独立极简 prompt 重试`);

      // ⭐ v2.16 优化 #10：截断重试用独立极简 prompt（不再拼接原 prompt）
      // 原版：retryPrompt = userPrompt + '\n\n---\n\n⚠️ 上次被截断...' （~5KB + 200 字节）
      // 新版：独立 prompt 模板（~700 字节 + L3 上下文）
      const compactRetryPrompt = COMPACT_RETRY_PROMPT
        .replace('{{L3_CODE}}', l3.code)
        .replace('{{L3_NAME}}', l3.name)
        .replace('{{L3_HOURS}}', String(l3.estimatedHours || 0))
        .replace('{{SOW_SECTION}}', l3.sowEvidence || 'N/A')
        .replace('{{L3_DELIVERABLE}}', l3.deliverable || 'N/A')
        .replace('{{L3_OWNER}}', l3.owner || 'PM')
        .replace('{{SOW_CONTEXT}}', (sowContext || '（无）').slice(0, 500));

      push('info', 'expand.retry.prompt_size', `📏 重试 prompt 体积：${compactRetryPrompt.length} 字符（原 ${userPrompt.length}，节省 ${userPrompt.length - compactRetryPrompt.length}）`, {
        retryChars: compactRetryPrompt.length,
        originalChars: userPrompt.length,
        savedChars: userPrompt.length - compactRetryPrompt.length,
      });

      const resp2 = await callLLMFull(llmConfig, compactRetryPrompt, log);
      if (resp2.usage) {
        push('info', 'llm.tokens.l3.retry', `🧮 ${l3.code} 重试 Token: prompt=${resp2.usage.prompt_tokens} completion=${resp2.usage.completion_tokens} total=${resp2.usage.total_tokens}`);
      }
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

/**
 * ⭐ v2.19: 纯遍历统计工具（无 LLM 调用）
 * 用于 MCP `wbs_stats` 工具 / 公开 API 快速预览
 * 入参: wbs 对象（包含 wbs.wbs 数组，节点有 level/children/estimatedHours）
 * 返回: { totalNodes, byLevel, maxDepth, totalHours, leafCount, l1Count, l2Count, l3Count }
 */
export function computeStats(wbs) {
  const empty = {
    totalNodes: 0,
    byLevel: {},
    maxDepth: 0,
    totalHours: 0,
    leafCount: 0,
    l1Count: 0,
    l2Count: 0,
    l3Count: 0,
  };
  if (!wbs || !Array.isArray(wbs.wbs)) return empty;

  let totalNodes = 0;
  const byLevel = {};
  let maxDepth = 0;
  let totalHours = 0;
  let leafCount = 0;

  function walk(nodes, depth) {
    for (const n of nodes) {
      totalNodes++;
      byLevel[depth] = (byLevel[depth] || 0) + 1;
      if (depth > maxDepth) maxDepth = depth;
      const hrs = Number(n.estimatedHours ?? n.hours ?? n.effortHours ?? n.durationHours) || 0;
      totalHours += hrs;
      if (Array.isArray(n.children) && n.children.length > 0) {
        walk(n.children, depth + 1);
      } else {
        leafCount++;
      }
    }
  }
  walk(wbs.wbs, 1);

  return {
    totalNodes,
    byLevel,
    maxDepth,
    totalHours,
    leafCount,
    l1Count: byLevel[1] || 0,
    l2Count: byLevel[2] || 0,
    l3Count: byLevel[3] || 0,
  };
}
