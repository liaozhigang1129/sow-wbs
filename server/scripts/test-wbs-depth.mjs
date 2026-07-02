// 测试 /api/generate 返回的 wbs 实际结构（用 docx SOW）
const fs = await import('node:fs/promises');
const path = '/Users/lzg/Downloads/二.docx';

// 先上传 docx
const fd = new FormData();
const buf = await fs.readFile(path);
fd.append('file', new Blob([buf]), '二.docx');

const upRes = await fetch('http://localhost:8787/api/upload', { method: 'POST', body: fd });
const upJ = await upRes.json();
console.log('上传结果:', { chars: upJ.text?.length, meta: upJ.meta });

// 截取前 1500 字符
const sowText = upJ.text.slice(0, 1500);

// 调用 generate
const genRes = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sowText,
    llmConfig: {
      provider: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
      apiKey: process.env.LLM_QWEN_API_KEY,
      model: 'qwen-plus',
      maxTokens: 16000,
    },
  }),
});
const genJ = await genRes.json();
if (genJ.error) { console.error('ERR:', genJ.error); process.exit(1); }

console.log('\n=== 顶层 keys ===');
console.log(Object.keys(genJ.wbs));
console.log('wbs 顶层:', genJ.wbs.wbs?.length, '个');
console.log('milestones:', genJ.wbs.milestones?.length, '个');

// 检查 wbs 树深度分布
const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let maxD = 0, total = 0;
function walk(n, d = 1) {
  total++;
  maxD = Math.max(maxD, d);
  if (d <= 5) dist[d] = (dist[d] || 0) + 1;
  else dist[5] = (dist[5] || 0) + 1;
  (n.children || []).forEach((c) => walk(c, d + 1));
}
(genJ.wbs.wbs || []).forEach((n) => walk(n));

console.log('\n=== 树深度统计 ===');
console.log('总节点数:', total);
console.log('最大深度:', maxD);
console.log('层级分布:', dist);

// 输出 L4-L5 节点明细（如果有）
const l4l5 = [];
function collect(n, d = 1) {
  if (d >= 4) l4l5.push({ depth: d, code: n.code, name: n.name, kids: n.children?.length || 0 });
  (n.children || []).forEach((c) => collect(c, d + 1));
}
(genJ.wbs.wbs || []).forEach((n) => collect(n));
console.log('\n=== L4-L5 节点 ===');
if (l4l5.length === 0) console.log('❌ 当前生成的 WBS 没有 L4-L5 节点（最深 L' + maxD + '）');
else l4l5.slice(0, 10).forEach((n) => console.log(`  L${n.depth} ${n.code} ${n.name} (kids=${n.kids})`));