// 前端组件模拟：把后端实际 wbs 数据传入并"渲染"输出
// 检查每层节点的渲染顺序（验证递归是否生效）

// 从 /api/generate 实际拿到数据
const r = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sowText: `【SOW 样例】客户流水分析智能体

1. 项目背景
需建设客户流水分析智能体，自动识别流水真伪、归类收支、识别风险。
支持 6 大问询场景。
18 周交付。`,
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
const wbs = j.wbs;

// 模拟 React useState
const expanded = {}; // 初始状态：所有节点默认展开（expanded[key] !== false → true）
function nodeKey(n) { return n.id || n.code; }

// 模拟 TreeNode 渲染逻辑
function renderNode(node, depth = 1) {
  const key = nodeKey(node);
  const isOpen = expanded[key] !== false;
  const hasChildren = node.children && node.children.length > 0;

  console.log(`${'  '.repeat(depth - 1)}L${depth} [${node.code}] ${node.name} (children=${node.children?.length || 0}, isOpen=${isOpen})`);

  if (hasChildren && isOpen) {
    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  }
}

console.log('=== 模拟前端默认渲染（所有节点默认展开）===');
console.log(`顶层节点数: ${wbs.wbs.length}\n`);
for (const top of wbs.wbs) {
  console.log(`\n[L1 顶层] ${top.code} ${top.name}`);
  renderNode(top, 2);
}
