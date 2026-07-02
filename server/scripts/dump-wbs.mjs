// Dump 第一个 L1 节点的完整原始 JSON
const r = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sowText: '【SOW 样例】测试项目。要求：18周交付，6大场景识别，准确率≥95%。'.repeat(3),
    llmConfig: {
      provider: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
      apiKey: process.env.LLM_QWEN_API_KEY,
      model: 'qwen-plus',
      maxTokens: 16000,
    },
  }),
});
const j = await r.json();
if (j.error) { console.error('ERR:', j.error); process.exit(1); }

const top0 = j.wbs.wbs[0];
console.log('=== wbs.wbs[0] 完整结构 ===');
console.log(JSON.stringify(top0, null, 2));
