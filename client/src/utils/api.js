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

export const generateWBS = (sowText, llmConfig) =>
  postJSON('/api/generate', { sowText, llmConfig });

export const mockGenerate = (sowText) =>
  postJSON('/api/mock-generate', { sowText });

export const validateWBS = (wbs) => postJSON('/api/validate', { wbs });

export const testLLM = (llmConfig) => postJSON('/api/test-llm', { llmConfig });

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