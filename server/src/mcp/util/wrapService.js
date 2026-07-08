// ⭐ v2.19: 共享的「WBS 生成」包装（被公开 API 与 MCP 同时复用）
// 统一 fallback 行为：
//  1. 没传 sowText → 抛 400
//  2. 没传 llmConfig.apiKey 但环境变量里有 → 用环境变量 + HEXAI_BASE_URL
//  3. 都没有 → 自动降级到 mock 生成器（无需 LLM，纯本地）
//
// 这样不管是 /api/generate、/api/v1/wbs/generate 还是 MCP wbs_generate，
// 行为完全一致。

import { generateWBS } from '../../services/wbsService.js';
import { mockGenerateFromSOW } from '../../services/mockService.js';

const ENV_KEY_MAP = {
  openai: ['LLM_OPENAI_API_KEY', 'LLM_QWEN_API_KEY'],
  claude: ['LLM_CLAUDE_API_KEY', 'ANTHROPIC_API_KEY'],
  claude_hexai: ['HEXAI_API_KEY', 'LLM_CLAUDE_API_KEY'],
};

function pickEnvKey(provider) {
  const keys = ENV_KEY_MAP[provider];
  if (!keys) return null;
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return null;
}

/**
 * 推断默认 provider
 *  优先依据用户传的 model 名字 → 落到对应的 env 链
 *  否则按 env 里谁先配了，谁就是默认
 *  最终兜底返回 'claude_hexai'（与 README/服务端约定一致）
 */
function inferDefaultProvider(cfg) {
  const m = String(cfg.model || '').toLowerCase();
  if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('o4')
      || m.includes('qwen') || m.includes('deepseek') || m.includes('llama')) {
    return 'openai';
  }
  if (m.includes('claude')) return 'claude';
  // 按 env 实际配的 key 推断
  if (process.env.HEXAI_API_KEY || process.env.LLM_CLAUDE_API_KEY) return 'claude_hexai';
  if (process.env.LLM_CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.LLM_OPENAI_API_KEY || process.env.LLM_QWEN_API_KEY) return 'openai';
  return 'claude_hexai';
}

function badRequest(code, message) {
  const e = new Error(message || code);
  e.status = 400;
  e.code = code;
  e.expose = true;
  return e;
}

export async function wrapGenerate({ sowText, llmConfig, options = {}, onLog }) {
  if (!sowText || typeof sowText !== 'string' || sowText.trim().length < 50) {
    throw badRequest('sow_text_too_short', 'sowText 不能为空，且长度需 ≥ 50 字符');
  }
  if (sowText.length > 500_000) {
    throw badRequest('sow_text_too_large', 'sowText 超过 50 万字符上限');
  }

  // 兜底：若无 apiKey 走环境变量
  // 1) 推断默认 provider（按 model 名 / 已知 env key）
  let cfg = llmConfig || {};
  if (!cfg.provider) {
    cfg.provider = inferDefaultProvider(cfg);
  }
  if (!cfg.apiKey) {
    const envKey = pickEnvKey(cfg.provider);
    if (envKey) {
      cfg = {
        ...cfg,
        apiKey: envKey,
        baseUrl: cfg.baseUrl || process.env.HEXAI_BASE_URL || undefined,
      };
    } else {
      // 降级到 mock
      const result = mockGenerateFromSOW(sowText, {
        promptMode: options.promptMode || 'flexible',
        enableL4L5: options.enableL4L5 !== false,
      });
      return {
        ...result,
        mock: true,
        degraded: true,
        degradedReason: '无 API Key，已自动降级到 mock 生成（基于 SOW 内容自适应）',
      };
    }
  }

  return await generateWBS({
    sowText,
    llmConfig: cfg,
    options: {
      ...options,
      enableCache: options.enableCache !== false,
      onLog: onLog || ((entry) => {
        const tag = entry.level === 'warn' ? '⚠️' : entry.level === 'error' ? '❌' : '•';
        console.log(`[wrapService] ${tag} [${entry.stage}] ${entry.msg}`);
      }),
    },
  }).catch((err) => {
    // ⭐ v2.19-fix：真 LLM 调用失败 → 自动降级 mock（不可中断调用方）
    console.error(`[wrapService] 真模型调用失败，降级到 mock：${err.message?.slice(0, 200)}`);
    const result = mockGenerateFromSOW(sowText, {
      promptMode: options.promptMode || 'flexible',
      enableL4L5: options.enableL4L5 !== false,
    });
    return {
      ...result,
      mock: true,
      degraded: true,
      degradedReason: `真模型调用失败 (${err.message?.slice(0, 60)}...)，已自动降级到 mock`,
    };
  });
}
