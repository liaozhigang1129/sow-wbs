// 单独的 API Key 可用性测试
const key = process.env.LLM_QWEN_API_KEY;
console.log('LLM_QWEN_API_KEY exists:', !!key);
console.log('Length:', key ? key.length : 0);
console.log('First 6 chars:', key ? key.slice(0, 6) : 'N/A');

// 直接测试 dashscope 连通性
const t0 = Date.now();
try {
  const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: '说 hi' }],
      max_tokens: 10,
    }),
  });
  const text = await resp.text();
  console.log(`HTTP ${resp.status} in ${Date.now()-t0}ms`);
  console.log('Body:', text.slice(0, 300));
} catch (e) {
  console.log('Error:', e.message);
}