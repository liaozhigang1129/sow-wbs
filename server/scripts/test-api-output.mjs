// 测试 /api/generate 返回的 wbs 实际结构
const text = `【SOW 样例】客户流水分析智能体

1. 项目背景
海门农商行客户经理日常需人工分析客户银行流水，工作量大、效率低、易出错。
需建设客户流水分析智能体，自动识别流水真伪、归类收支、识别风险。

2. 业务目标
- 支持 6 大问询场景：综合分析、完整性检测、PS篡改/拆分冲账识别、过桥拆借识别、偿债能力测算、异常时段筛查
- 准确率 ≥ 95%
- 单笔响应 ≤ 3s，批量 ≤ 10s

3. 技术要求
- 基于行内大模型 + Agent 框架
- 支持 PS 篡改检测
- 支持 RAG 索引全量流水

4. 交付要求
- 18 周交付，分 4 个 Sprint 迭代 + 上线
- 团队规模 8 人`;

const r = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sowText: text,
    llmConfig: {
      provider: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
      apiKey: process.env.LLM_QWEN_API_KEY || '',
      model: 'qwen-plus',
      temperature: 0,
      maxTokens: 16000,
    },
  }),
});
const j = await r.json();
if (j.error) { console.error('ERROR:', j.error); process.exit(1); }

console.log('=== 顶层 keys ===');
console.log(Object.keys(j.wbs));
console.log('lifecyclePhases:', j.wbs.lifecyclePhases?.length, '个');
console.log('wbs 顶层节点:', j.wbs.wbs?.length, '个');

console.log('\n=== WBS 树详细结构 ===');
function inspect(node, depth = 1, parentCode = '') {
  // 只显示原始 code，不做拼接
  console.log(`  L${depth} code="${node.code}" parentId=${node.parentId||'?'} name="${(node.name||'').slice(0,15)}" id=${JSON.stringify(node.id||null)} kids=${node.children?.length||0}`);
  (node.children || []).forEach(c => inspect(c, depth + 1));
}
(j.wbs.wbs || []).forEach(n => inspect(n));

console.log('\n=== 统计 ===');
let totalNodes = 0, maxDepth = 0, noIdNodes = 0;
function stat(n, d = 1) {
  totalNodes++;
  maxDepth = Math.max(maxDepth, d);
  if (!('id' in n)) noIdNodes++;
  (n.children||[]).forEach(c => stat(c, d+1));
}
(j.wbs.wbs || []).forEach(n => stat(n));
console.log(`总节点数: ${totalNodes}, 最深: L${maxDepth}, 无 id 节点: ${noIdNodes}`);
