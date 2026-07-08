// 调用后端 API 的封装
async function postJSON(url, data) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await resp.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text };
  }
  if (!resp.ok) {
    const err = new Error(body.error || `HTTP ${resp.status}`);
    err.log = body.log || [];
    err.meta = body.meta || null;
    throw err;
  }
  return body;
}

async function postFile(url, formData) {
  const resp = await fetch(url, { method: 'POST', body: formData });
  let body;
  try {
    body = await resp.json();
  } catch {
    body = { error: '非 JSON 响应' };
  }
  if (!resp.ok) {
    const err = new Error(body.error || `HTTP ${resp.status}`);
    err.log = body.log || [];
    throw err;
  }
  return body;
}

export const uploadSOW = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return postFile('/api/upload', fd);
};

export const generateWBS = (sowText, llmConfig, options = {}) =>
  postJSON('/api/generate', { sowText, llmConfig, options });

export const mockGenerate = (sowText, options = {}) =>
  postJSON('/api/mock-generate', { sowText, options });

/**
 * ⭐ v3.0: 按需展开单个 L3 为 L4-L5
 * 入参: l3 {code,name,estimatedHours,owner,deliverable,sowEvidence}
 *       sowContext (可选) / sowText (可选) / llmConfig
 * 返回: { l3: { ...原节点, children:[L4/L5] }, log, meta }
 */
export const expandL3 = (l3, { sowContext, sowText, llmConfig } = {}) =>
  postJSON('/api/expand-l3', { l3, sowContext, sowText, llmConfig });

export const validateWBS = (wbs) => postJSON('/api/validate', { wbs });

export const testLLM = (llmConfig) => postJSON('/api/test-llm', { llmConfig });

/**
 * ⭐ v3.x: 拉取系统兜底 LLM 配置
 * 后端从 .env / 系统默认解析；只返回元信息，apiKey 永远不返回明文
 * 典型用法：用户没手动配 llmConfig 时，前端拉一次看看有没有兜底
 */
export async function fetchDefaultLLM() {
  const resp = await fetch('/api/llm-default');
  if (!resp.ok) {
    return { ok: false, error: `HTTP ${resp.status}` };
  }
  return resp.json();
}

export async function exportFile(format, wbs) {
  const resp = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, wbs }),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const b = await resp.json();
      msg = b.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get('Content-Disposition') || '';
  const m = disposition.match(/filename="?([^"]+)"?/);
  const filename = m ? m[1] : `wbs.${format}`;
  // 触发下载
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}