// /api/expand-l3 - 按需展开单个 L3 为 L4-L5
// ⭐ v3.0: 设计为「先看骨架，按需展开」的核心接口
//
// 请求体:
//   {
//     l3: { code, name, estimatedHours, owner, deliverable, sowEvidence },
//     sowContext: "SOW 相关片段（可选）",
//     sowText: "完整 SOW 文本（可选，配合 sowEvidence 自动提取章节）",
//     llmConfig: { provider, model, apiKey, baseUrl }
//   }
//
// 响应: { l3: { code, name, level:3, children:[...] }, log, meta }

import express from 'express';
import { expandSingleL3Public, normalizeOwner } from '../services/wbsService.js';

// ⭐ 本地辅助：SOW 章节切分（与 wbsService.js 内部实现等价）
function buildSowContextMapLocal(sowText) {
  const map = new Map();
  const lines = String(sowText || '').split('\n');
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

function getSowContextForL3Local(l3, ctxMap, fullSowText) {
  const sectionMatch = (l3.sowEvidence || '').match(/(\d+(\.\d+)*)/);
  if (sectionMatch) {
    const section = sectionMatch[1];
    if (ctxMap.has(section)) {
      return truncateContextLocal(ctxMap.get(section), 2000);
    }
  }
  return truncateContextLocal(fullSowText || '', 2000);
}

function truncateContextLocal(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.3));
  return `${head}\n\n[... 中间省略 ...]\n\n${tail}`;
}

const router = express.Router();
const ts = () => new Date().toISOString().split('T')[1].slice(0, 12);

router.post('/', async (req, res) => {
  const t0 = Date.now();
  const reqId = `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    const { l3, sowContext, sowText, llmConfig } = req.body || {};

    if (!l3 || !l3.code || !l3.name) {
      return res.status(400).json({ error: '缺少 l3 节点（至少含 code/name）' });
    }

    console.log(`[expand-l3][${reqId}][请求] L3=${l3.code} "${l3.name}" hours=${l3.estimatedHours || 0} provider=${llmConfig?.provider || 'mock'}`);

    const log = [];
    const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });

    // 1. 决定 context：优先用前端传入，否则按 sowText + sowEvidence 自动提取
    let finalContext = sowContext;
    if (!finalContext && sowText) {
      const ctxMap = buildSowContextMapLocal(sowText);
      finalContext = getSowContextForL3Local(l3, ctxMap, sowText);
    }
    if (!finalContext) {
      finalContext = '（未提供 SOW 上下文，基于 L3 名称常识展开）';
    }
    finalContext = truncateContextLocal(finalContext, 2000);

    push('info', 'expand-l3.received', `📥 收到展开请求 ${l3.code} "${l3.name}"`, {
      code: l3.code,
      hours: l3.estimatedHours,
      hasContext: !!sowContext,
      hasSow: !!sowText,
    });

    // 2. 解析 llmConfig（支持环境变量 fallback + mock 降级）
    const finalLlmConfig = { ...(llmConfig || {}) };
    if (!finalLlmConfig.apiKey || finalLlmConfig.apiKey === '__system_default__') {
      if (finalLlmConfig.apiKey === '__system_default__') finalLlmConfig.apiKey = '';
      // ⭐ v3.x: 兜底 baseUrl / model 走 normalizeLLMConfig
      try {
        const { normalizeLLMConfig } = await import('../services/llmDefault.js');
        const nd = normalizeLLMConfig(finalLlmConfig);
        finalLlmConfig.provider = nd.provider;
        finalLlmConfig.baseUrl = nd.baseUrl;
        finalLlmConfig.model = nd.model;
      } catch (e) {
        console.warn(`[expand-l3][${reqId}][warn] normalizeLLMConfig 失败：${e.message}`);
      }
      const envMap = {
        openai: process.env.LLM_OPENAI_API_KEY || process.env.LLM_QWEN_API_KEY,
        claude: process.env.LLM_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
        claude_hexai: process.env.HEXAI_API_KEY || process.env.LLM_CLAUDE_API_KEY,
      };
      const fallback = envMap[finalLlmConfig.provider];
      if (fallback) {
        finalLlmConfig.apiKey = fallback;
        if (!finalLlmConfig.baseUrl && process.env.HEXAI_BASE_URL) {
          finalLlmConfig.baseUrl = process.env.HEXAI_BASE_URL;
        }
        push('info', 'config', '🔑 使用环境变量 API Key', { provider: finalLlmConfig.provider });
      } else {
        // 无 API Key → 走 mock 降级
        push('warn', 'no-key', '⚠️ 无 API Key，使用 mock 降级生成 L4-L5');
        const mockL3 = mockExpandL3(l3);
        const elapsed = Date.now() - t0;
        console.log(`[expand-l3][${reqId}][响应] ✓ mock ${elapsed}ms, children=${mockL3.children?.length || 0}`);
        return res.json({
          l3: mockL3,
          log,
          mock: true,
          degraded: true,
          degradedReason: '无 API Key，已使用 mock 展开',
          meta: { parseMethod: 'mock-expand', elapsedMs: elapsed },
        });
      }
    }

    push('info', 'context', `📄 SOW 上下文：${finalContext.length} 字符`);

    // 3. 调 LLM 展开
    const expandedL3 = await expandSingleL3Public({
      l3: { ...l3, owner: normalizeOwner(l3.owner || 'PM') },
      sowContext: finalContext,
      llmConfig: finalLlmConfig,
      log,
    });

    const elapsed = Date.now() - t0;
    console.log(`[expand-l3][${reqId}][响应] ✓ ${elapsed}ms, children=${expandedL3.children?.length || 0}`);

    res.json({
      l3: expandedL3,
      log,
      meta: { parseMethod: 'llm-expand', elapsedMs: elapsed },
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(`[expand-l3][${reqId}][错误] ✗ ${elapsed}ms`, err.stack || err);
    res.status(500).json({
      error: err.message || '展开失败',
      log: err.log || [],
    });
  }
});

/**
 * Mock 展开单个 L3（无 API Key 时降级）
 * 生成 3 个 L4，其中第 2 个 L4（编码实现）拆 3 个 L5
 */
function mockExpandL3(l3) {
  const l3Hours = l3.estimatedHours || 24;
  const l4Count = 3;
  const l4Hours = Math.round(l3Hours / l4Count);
  const children = [];

  const tplNames = [
    { name: '方案设计服务', owner: 'BA', ratio: 0.20 },
    { name: '编码实现模块', owner: 'Dev', ratio: 0.50 },
    { name: '测试验证报告', owner: 'QA', ratio: 0.30 },
  ];

  for (let i = 0; i < l4Count; i++) {
    const tpl = tplNames[i];
    // L4 工时按比例还原到 l3Hours
    const l4HoursActual = Math.max(4, Math.round(l3Hours * tpl.ratio));
    const l4 = {
      id: `${l3.code}.${i + 1}`,
      code: `${l3.code}.${i + 1}`,
      name: tpl.name,
      level: 4,
      estimatedHours: l4HoursActual,
      owner: tpl.owner,
      deliverable: tpl.name.replace(/(方案|报告|服务|模块)$/, '交付物'),
      sowEvidence: l3.sowEvidence || 'mock',
      children: [],
    };

    // 编码实现模块拆 L5
    if (i === 1 && l4HoursActual >= 12) {
      const l5Count = 3;
      const l5Hours = Math.round(l4HoursActual / l5Count);
      for (let j = 0; j < l5Count; j++) {
        l4.children.push({
          id: `${l4.code}.${j + 1}`,
          code: `${l4.code}.${j + 1}`,
          name: `子任务${j + 1}实现`,
          level: 5,
          estimatedHours: l5Hours,
          owner: 'Dev',
          deliverable: '代码包',
          sowEvidence: l3.sowEvidence || 'mock',
          children: [],
        });
      }
      // 修正 L4 hours = Σ L5 hours
      l4.estimatedHours = l4.children.reduce((s, c) => s + c.estimatedHours, 0);
    }

    children.push(l4);
  }

  // 修正 L3 hours = Σ L4 hours
  const totalL4 = children.reduce((s, c) => s + c.estimatedHours, 0);

  return {
    id: l3.code,
    code: l3.code,
    name: l3.name,
    level: 3,
    estimatedHours: totalL4,
    owner: normalizeOwner(l3.owner || 'PM'),
    deliverable: l3.deliverable || '',
    sowEvidence: l3.sowEvidence || '',
    children,
  };
}

export default router;
