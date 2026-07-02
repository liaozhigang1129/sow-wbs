// 多厂商大模型适配器
// 支持：openai（OpenAI 兼容接口）、claude（Anthropic）
// 前端传入 provider/baseUrl/apiKey/model 即可
// 关键节点：自动重试（429/5xx）+ 截断检测 + 完整日志
import fetch from 'node-fetch';

// ====== 日志工具 ======
function ts() {
  return new Date().toISOString().split('T')[1].slice(0, 12); // HH:MM:SS.mmm
}

/**
 * 在 cfg 上累积日志（每次调用浅拷贝），最终返回给前端
 * 每条: { t, level, stage, msg, data? }
 */
export function makeLog() {
  return [];
}

/**
 * 通用重试：指数退避（最多 retries 次，仅对 429/5xx/网络错误重试）
 */
async function fetchWithRetry(url, options, { retries = 3, baseDelay = 1500, onRetry, label = 'LLM', timeoutMs = 900000 } = {}) {
  let lastErr;
  console.log(`[llm] → ${label} ${url}`);
  // ⭐ 通过 AbortController 给 fetch 加超时（默认 15 分钟）
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(new Error(`fetch timeout after ${timeoutMs}ms`)), timeoutMs);
  options = { ...options, signal: ctrl.signal };
  for (let attempt = 1; attempt <= retries; attempt++) {
    const start = Date.now();
    try {
      const resp = await fetch(url, options);
      const latency = Date.now() - start;
      console.log(`[llm] ← ${label} HTTP ${resp.status} (${latency}ms, attempt ${attempt})`);
      if (resp.ok) {
        clearTimeout(t);
        return { resp, latency, attempt };
      }
      const text = await resp.text();
      // 429/5xx → 可重试
      if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // 1.5s, 3s, 6s
        onRetry?.({ attempt, status: resp.status, retryIn: delay, latency, label });
        await new Promise((r) => setTimeout(r, delay));
        lastErr = new Error(`${label} [${resp.status}]: ${text.slice(0, 200)}`);
        continue;
      }
      // 最后一次失败或不可重试（4xx）
      const tag = (resp.status === 429 || resp.status >= 500) ? 'FAIL-RETRY' : 'FAIL';
      onRetry?.({ attempt, status: tag, retryIn: 0, latency, label, httpStatus: resp.status });
      throw new Error(`${label} 调用失败 [${resp.status}]: ${text.slice(0, 400)}`);
    } catch (err) {
      const latency = Date.now() - start;
      // 网络错误：ENOTFOUND/ETIMEDOUT/ECONNRESET 等，可重试
      const isNetErr = /ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed/i.test(err.message || '');
      if (isNetErr && attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        onRetry?.({ attempt, status: 'NETERR', retryIn: delay, latency, label });
        await new Promise((r) => setTimeout(r, delay));
        lastErr = err;
        continue;
      }
      // 最后一次失败或不可重试错误
      onRetry?.({ attempt, status: isNetErr ? 'NETERR-FAIL' : 'FAIL', retryIn: 0, latency, label });
      clearTimeout(t);
      throw err;
    }
  }
  clearTimeout(t);
  throw lastErr || new Error(`${label} 重试 ${retries} 次后仍失败`);
}

/**
 * 统一调用入口（带日志）
 * @param {object} cfg  + log: 日志数组（会原地追加）
 */
export async function callLLM(cfg, prompt, log) {
  const r = await callLLMFull(cfg, prompt, log);
  return r.text;
}

/**
 * 调用并返回详细结果（带日志）
 * @returns {Promise<{text: string, finishReason?: string, truncated?: boolean, model?: string, latencyMs?: number, usage?: object}>}
 */
export async function callLLMFull(cfg, prompt, log) {
  const provider = cfg.provider || 'openai';
  log?.push({ t: ts(), level: 'info', stage: 'call', msg: `→ 调用 ${provider} ${cfg.model}`, data: { baseUrl: cfg.baseUrl, maxTokens: cfg.maxTokens } });
  const t0 = Date.now();
  let result;
  if (provider === 'claude') {
    result = await callClaudeFull(cfg, prompt, log);
  } else {
    result = await callOpenAIFull(cfg, prompt, log);
  }
  const totalMs = Date.now() - t0;
  log?.push({
    t: ts(),
    level: result.truncated ? 'warn' : 'info',
    stage: 'call.done',
    msg: `← ${provider} 返回 ${result.text.length} 字符，${totalMs}ms，finish_reason=${result.finishReason || '?'}`,
    data: { latencyMs: totalMs, chars: result.text.length, finishReason: result.finishReason, model: result.model },
  });
  if (result.truncated) {
    log?.push({
      t: ts(),
      level: 'warn',
      stage: 'truncated',
      msg: `⚠️ 检测到输出被截断（${result.finishReason}）。将进入自动修补/续写流程。`,
      data: { reason: result.finishReason },
    });
  }
  return { ...result, latencyMs: totalMs };
}

/**
 * 测试连通性
 */
export async function testLLM(cfg) {
  if (!cfg?.apiKey) return { ok: false, message: '缺少 API Key', latencyMs: 0 };
  const start = Date.now();
  try {
    if (cfg.provider === 'claude') return await testClaude(cfg, start);
    return await testOpenAICompatible(cfg, start);
  } catch (err) {
    return { ok: false, message: err.message || String(err), latencyMs: Date.now() - start };
  }
}

async function testOpenAICompatible(cfg, start) {
  const baseUrl = (cfg.baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  // ⭐ 修复：baseUrl 已含 /v1 时不再重复追加
  const url = baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ model: cfg.model || 'gpt-4o', max_tokens: 16, temperature: 0, messages: [{ role: 'user', content: 'ping' }] }),
  });
  const latencyMs = Date.now() - start;
  const text = await resp.text();
  if (!resp.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    return { ok: false, message: `HTTP ${resp.status}：${msg}`, latencyMs };
  }
  const body = JSON.parse(text);
  const echo = body?.choices?.[0]?.message?.content?.trim?.() || '';
  return { ok: true, message: '连接成功', latencyMs, echo: echo.slice(0, 80), model: body?.model || cfg.model };
}

async function testClaude(cfg, start) {
  const baseUrl = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1/messages`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model || 'claude-3-5-sonnet-20241022', max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] }),
  });
  const latencyMs = Date.now() - start;
  const text = await resp.text();
  if (!resp.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
    return { ok: false, message: `HTTP ${resp.status}：${msg}`, latencyMs };
  }
  const body = JSON.parse(text);
  const echo = body?.content?.[0]?.text?.trim?.() || '';
  return { ok: true, message: '连接成功', latencyMs, echo: echo.slice(0, 80), model: body?.model || cfg.model };
}

// ====== 实际生成调用（带重试 + 日志） ======

async function callOpenAIFull(cfg, prompt, log) {
  const { baseUrl, apiKey, model, temperature = 0, maxTokens } = cfg;
  if (!apiKey) throw new Error('缺少 API Key');
  const cleanBase = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '');
  // ⭐ 修复：baseUrl 已含 /v1 时不再重复追加
  const url = cleanBase.endsWith('/v1') ? `${cleanBase}/chat/completions` : `${cleanBase}/v1/chat/completions`;

  const { resp, latency, attempt } = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      temperature,
      max_tokens: Number(maxTokens) || 16000,
      // ⭐ Claude 不支持 response_format，仅在非 Claude 模型时注入
      ...(model?.includes('claude') ? {} : { response_format: { type: 'json_object' } }),
      messages: [
        { role: 'system', content: '你是一位严格遵守 WBS Master Prompt v2.3 规范的 PMO 顾问。严格输出合法 JSON（无任何 Markdown 围栏、无寒暄、无解释）。如果输出过长，请优先保证 JSON 结构完整、子节点充分，但允许省略 deliverable/sowRef 等次要字段。' },
        { role: 'user', content: prompt },
      ],
    }),
  }, {
    retries: 3,
    label: 'OpenAI',
    onRetry: ({ attempt, status, retryIn, latency }) => {
      log?.push({ t: ts(), level: 'warn', stage: 'retry', msg: `🔄 OpenAI 第 ${attempt} 次失败 [${status}]，${latency}ms，${(retryIn / 1000).toFixed(1)}s 后重试`, data: { attempt, status, retryIn, latency } });
    },
  });

  if (attempt > 1) {
    log?.push({ t: ts(), level: 'info', stage: 'retry.success', msg: `✓ 第 ${attempt} 次重试成功`, data: { attempt, latency } });
  }

  const data = await resp.json();
  const choice = data?.choices?.[0];
  const finishReason = choice?.finish_reason;
  // ⭐ v2.6 改进：兼容多种截断标记（hexai 中转可能用 "length" / "max_tokens" / "stop"）
  const truncated = finishReason === 'length' || finishReason === 'max_tokens';
  return {
    text: choice?.message?.content || '',
    finishReason,
    truncated,
    model: data?.model,
    usage: data?.usage,
  };
}

async function callClaudeFull(cfg, prompt, log) {
  const { baseUrl, apiKey, model, temperature = 0, maxTokens } = cfg;
  if (!apiKey) throw new Error('缺少 API Key');
  const url = `${(baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;

  const { resp, latency, attempt } = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: Number(maxTokens) || 20000,
      temperature,
      system: '你是一位严格遵守 WBS Master Prompt v2.3 规范的 PMO 顾问。严格输出合法 JSON（无任何 Markdown 围栏、无寒暄、无解释）。如果输出过长，请优先保证 JSON 结构完整、子节点充分，但允许省略 deliverable/sowRef 等次要字段。',
      messages: [{ role: 'user', content: prompt }],
    }),
  }, {
    retries: 3,
    label: 'Claude',
    onRetry: ({ attempt, status, retryIn, latency }) => {
      log?.push({ t: ts(), level: 'warn', stage: 'retry', msg: `🔄 Claude 第 ${attempt} 次失败 [${status}]，${latency}ms，${(retryIn / 1000).toFixed(1)}s 后重试`, data: { attempt, status, retryIn, latency } });
    },
  });

  if (attempt > 1) {
    log?.push({ t: ts(), level: 'info', stage: 'retry.success', msg: `✓ 第 ${attempt} 次重试成功`, data: { attempt, latency } });
  }

  const data = await resp.json();
  const block = data?.content?.[0];
  return {
    text: block?.text || '',
    finishReason: data?.stop_reason,
    truncated: data?.stop_reason === 'max_tokens',
    model: data?.model,
    usage: data?.usage,
  };
}

// ====== JSON 解析 + 修补 ======

/**
 * 尝试修复截断的 JSON
 * 覆盖以下截断状态：
 *   A. 字符串值未闭合         "name": "abc
 *   B. 字段写出但无值         "key":
 *   C. 数组元素残缺           [{"a":1},
 *   D. 对象/数组起始后空      {  /  [
 *   E. 数组结束但整体未闭合   [{"a":1}]
 *   F. 末尾多余逗号           {"a":1,
 */
export function tryRepairTruncatedJSON(text) {
  if (!text) return null;
  let s = text.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let body = s.slice(start);

  // 预处理：剥离末尾的非 JSON 字符（如模型输出的"截断"中文提示）
  body = stripTrailingJunk(body);

  body = body.replace(/,\s*"[^"]*"\s*:\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*$/, '');
  body = body.replace(/,\s*"[^"]*"\s*:\s*(true|false|null|-?\d+(?:\.\d+)?)\s*$/, '');
  body = body.replace(/,\s*$/, '');

  // 扫描：维护嵌套栈 + 当前是否在字符串中
  // ctx 含义：
  //   'O' = 当前在对象层，期望下一个是键（也接受 } 表示结束）
  //   'A' = 当前在数组层，期望下一个是值
  // stack 元素：本次进入的容器类型（'O'=进对象，'A'=进数组），用于决定补 } 还是 ]
  let inStr = false;
  let escape = false;
  let ctx = 'O';           // 顶层也按对象处理
  const stack = [];
  let afterColon = false;  // : 之后期望一个值

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '"') { inStr = true; afterColon = false; continue; }
    // 记录本次进入的容器类型
    if (c === '{') { stack.push('O'); ctx = 'O'; afterColon = false; continue; }
    if (c === '[') { stack.push('A'); ctx = 'A'; afterColon = false; continue; }
    if (c === '}' || c === ']') {
      if (stack.length) stack.pop();
      // 还原 ctx：上一层类型
      const parent = stack[stack.length - 1];
      ctx = parent === 'A' ? 'A' : 'O';
      afterColon = false;
      continue;
    }
    // : 不改变 ctx，只标记 afterColon
    if (c === ':') { afterColon = true; continue; }
    if (c === ',') {
      // , 后：对象→期望键(O)，数组→仍期望值(A)
      const top = stack[stack.length - 1];
      ctx = top === 'A' ? 'A' : 'O';
      afterColon = false;
      continue;
    }
    // 数字 / true / false / null 等字面值字符 → 表示值已提供
    afterColon = false;
  }

  // 计算闭合符号（栈记录的是进入的容器类型，按反序补）
  const closing = stack.slice().reverse().map((c) => (c === 'O' ? '}' : ']')).join('');

  // 修补决策
  // ⭐ v2.6 改进：精确判断字符串截断位置是 key 还是 value
  //   - key 位置（向前找到分隔符是 `,` 或 `{` 或 `[`）：需要补 `":null`
  //   - value 位置（向前找到分隔符是 `:`）：只需补 `"`
  let prefix = body;
  if (inStr) {
    // 向前跳过空白和字母数字下划线，找到最近的"结构分隔符"
    let j = body.length - 1;
    while (j >= 0 && /[\w\s"]/.test(body[j])) j--;
    const sep = body[j];
    if (sep === ',' || sep === '{' || sep === '[') {
      // 字符串是 key，需要 `":null`
      prefix = body + '":null';
    } else if (sep === ':') {
      // 字符串是 value，只需闭合 `"`
      prefix = body + '"';
    } else {
      // 兜底：闭合字符串
      prefix = body + '"';
    }
  } else if (afterColon) {
    prefix += 'null';
  }
  const repaired = prefix + closing;

  try {
    return JSON.parse(repaired);
  } catch {
    const aggressive = aggressiveRepair(repaired);
    if (aggressive) {
      try { return JSON.parse(aggressive); } catch { return null; }
    }
    return null;
  }
}

function aggressiveRepair(s) {
  // 策略 1：从后往前逐字符剥，碰到合法 JSON 即停（关键边界符优先）
  for (let i = s.length - 1; i > Math.max(0, s.length - 500); i--) {
    const c = s[i];
    if (c === '"' || c === '}' || c === ']' || c === ',' || c === ':') {
      try {
        const candidate = s.slice(0, i);
        const closed = candidate + autoClose(candidate);
        return JSON.parse(closed);
      } catch {}
    }
  }

  // 策略 2：尝试"剥洋葱"——逐层删除最后未闭合的 wbs 节点
  const onionResult = peelOnion(s);
  if (onionResult) return onionResult;

  // 策略 3：暴力剥除任意非 JSON 字符尾部，再补全闭合
  // 找到最后一个真正的 JSON 结构（}, ], ", :, ,）位置
  const lastJsonChar = Math.max(
    s.lastIndexOf('}'),
    s.lastIndexOf(']'),
    s.lastIndexOf('"'),
  );
  if (lastJsonChar > s.length * 0.3) {
    const candidate = s.slice(0, lastJsonChar + 1);
    const closed = candidate + autoClose(candidate);
    try { return JSON.parse(closed); } catch {}
  }

  return null;
}

/**
 * 逐层剥除策略：递归尝试切除最深的未闭合子节点
 * 适用场景：截断在 wbs 树深处，状态机无法正确修补时
 */
function peelOnion(s) {
  let body = s;
  for (let round = 0; round < 10; round++) {
    // 先尝试状态机修补
    const repaired = stateMachineRepair(body);
    if (repaired) {
      try { return JSON.parse(repaired); } catch {}
    }
    // 修补失败 → 尝试找到最后一个完整的 "}," 模式（wbs 元素结束 + 数组分隔）
    // 然后切掉该位置之后的所有内容
    const candidates = [
      /,\s*\{[^}]*$/,      // 切到当前对象结尾
      /,\s*\[[^\]]*$/,     // 切到当前数组结尾
      /\{\s*"id"[^:]*:[^,}]*,[^}]*$/,  // 切到 id 字段后
    ];
    let trimmed = false;
    for (const re of candidates) {
      const m = body.match(re);
      if (m && m.index > body.length * 0.5) {
        body = body.slice(0, m.index);
        trimmed = true;
        break;
      }
    }
    if (!trimmed) break;
  }
  return null;
}

/**
 * 状态机修补（提取 tryRepairTruncatedJSON 的核心逻辑）
 */
function stateMachineRepair(text) {
  let s = text.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  let body = s.slice(start);

  // 预处理：剥离末尾的非 JSON 字符（如模型输出的"截断"中文提示）
  // 但保留合法 JSON 边界符 { } [ ] " : , 空白
  // 策略：从后往前，找到第一个让剩余内容仍可能合法的位置
  body = stripTrailingJunk(body);

  body = body.replace(/,\s*"[^"]*"\s*:\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*$/, '');
  body = body.replace(/,\s*"[^"]*"\s*:\s*(true|false|null|-?\d+(?:\.\d+)?)\s*$/, '');
  body = body.replace(/,\s*$/, '');

  let inStr = false, escape = false, ctx = 'O', afterColon = false;
  const stack = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '"') { inStr = true; afterColon = false; continue; }
    if (c === '{') { stack.push('O'); ctx = 'O'; afterColon = false; continue; }
    if (c === '[') { stack.push('A'); ctx = 'A'; afterColon = false; continue; }
    if (c === '}' || c === ']') {
      if (stack.length) stack.pop();
      const parent = stack[stack.length - 1];
      ctx = parent === 'A' ? 'A' : 'O';
      afterColon = false;
      continue;
    }
    if (c === ':') { afterColon = true; continue; }
    if (c === ',') {
      const top = stack[stack.length - 1];
      ctx = top === 'A' ? 'A' : 'O';
      afterColon = false;
      continue;
    }
    afterColon = false;
  }
  let prefix = body;
  if (inStr) prefix += '"';
  else if (afterColon) prefix += 'null';
  const closing = stack.slice().reverse().map((c) => (c === 'O' ? '}' : ']')).join('');
  return prefix + closing;
}

/**
 * 剥离末尾的杂物字符（非 JSON 结构）
 * LLM 可能在闭合括号前/后夹杂"截断说明"等中文字符
 * 关键：不能破坏正常 JSON（合法 JSON 末尾不应有杂物）
 * 策略：只在 JSON 修补失败后才尝试剥离 → 此函数实际不做剥离，由 stateMachineRepair 末尾再处理
 */
function stripTrailingJunk(body) {
  // 当前简化实现：不预剥离（避免破坏合法 JSON）
  // 实际杂物处理在 stateMachineRepair 末尾 + aggressiveRepair 中进行
  return body;
}

/**
 * 自动补全闭合括号（独立函数）
 */
function autoClose(s) {
  let inStr = false, escape = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') stack.push('O');
    else if (c === '[') stack.push('A');
    else if (c === '}' || c === ']') stack.pop();
  }
  if (inStr) return '"' + stack.slice().reverse().map((c) => (c === 'O' ? '}' : ']')).join('');
  return stack.slice().reverse().map((c) => (c === 'O' ? '}' : ']')).join('');
}

/**
 * 宽松提取 JSON，自动尝试修补截断
 *
 * 修补阶段（按代价从低到高）：
 *   1. 直接 JSON.parse
 *   2. 栈平衡找最外层 {...} 后解析
 *   3. ⭐ fixCommonHexaiTypos —— 修复 hexai 中转 / Claude 4 常见的"值多余引号"缺陷
 *      （如 "level":3", 应为 "level":3,，17 处稳定出现）
 *   4. tryRepairTruncatedJSON —— 处理真截断（状态机 + 暴力修补）
 */
export function extractJSON(raw) {
  if (!raw) throw new Error('模型返回为空');
  let text = raw.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(text); } catch (_) {}

  // 用栈平衡找最外层 { ... }，避免 lastIndexOf('}') 命中杂物字符里的 }
  const start = text.indexOf('{');
  if (start >= 0) {
    const end = findMatchingBrace(text, start);
    if (end > start) {
      const slice = text.slice(start, end + 1);
      try { return JSON.parse(slice); } catch (_) {}
    }
  }

  // ⭐ 第三阶段：修复 hexai/Claude 4 中转常见缺陷
  //   错误模式 1：数字/布尔/null 值后多出一个引号
  //               "level":3",  /  "isCritical":true",  /  "owner":null",
  //   错误模式 2：字符串值后多出一个引号（罕见）
  //               "name":"foo"",  →  "name":"foo",
  //   这些都是合法 JSON 的子集才能触发的 fix，必须在 tryParse 失败后跑
  try {
    const fixed = fixCommonHexaiTypos(text);
    if (fixed !== text) {
      const obj = JSON.parse(fixed);
      console.log(`[extractJSON] ✓ 修复 hexai 常见缺陷成功，长度 ${text.length}→${fixed.length}`);
      return obj;
    }
  } catch (_) {}

  const repaired = tryRepairTruncatedJSON(text);
  if (repaired) return repaired;
  throw new Error(`无法解析 JSON\n原始片段: ${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`);
}

/**
 * 修复 hexai / Claude 4 中转站常见的 JSON 缺陷
 * - 数字值多引号：":3", → ":3,"
 * - 布尔/null 值多引号：":true", → ":true,"
 * - 字符串值多引号（罕见）："foo"," → "foo","
 *
 * 注意：必须保留 : 前缀，只删除多余的 "。
 */
function fixCommonHexaiTypos(text) {
  let s = text;
  // 模式 1: ":N",  / ":N.N",  / ":true",  / ":false",  / ":null",
  //   保留冒号和值，删除多余的 "
  s = s.replace(/(:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"(?=\s*[,}\]])/g, '$1');
  s = s.replace(/:(true|false|null)"(?=\s*[,}\]])/g, ':$1');
  // 模式 2: 字符串值后多引号（保守：仅处理简单 ASCII 字符串）
  s = s.replace(/(:"[A-Za-z0-9_./\-\u4e00-\u9fa5]+")"(?=\s*[,}\]])/g, '$1');
  return s;
}

/**
 * 用栈平衡找 text[start] 匹配的 }（考虑字符串、嵌套）
 * 返回匹配 } 的索引，找不到返回 -1
 */
function findMatchingBrace(text, start) {
  let inStr = false, escape = false;
  const stack = [];
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === '"') { inStr = true; continue; }
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      if (!stack.length) return -1;
      const expected = stack.pop();
      if (c !== expected) return -1; // 嵌套不匹配
      if (stack.length === 0) return i; // 栈空，找到最外层
    }
  }
  return -1;
}