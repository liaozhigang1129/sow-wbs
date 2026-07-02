// 验证 hexai Claude Sonnet 4 真实生成 WBS（10 分钟超时）
import fs from 'node:fs/promises';

const fd = new FormData();
const buf = await fs.readFile('/Users/lzg/Downloads/二.docx');
fd.append('file', new Blob([buf]), '二.docx');
const upRes = await fetch('http://localhost:8787/api/upload', { method: 'POST', body: fd });
const upJ = await upRes.json();
const sowText = upJ.text.slice(0, 1500);
console.log('✅ 上传:', upJ.text?.length, '字符');

const t0 = Date.now();
const r = await fetch('http://localhost:8787/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sowText,
    llmConfig: {
      provider: 'claude_hexai',
      baseUrl: 'https://crs.hexai.cn/api/v1',
      apiKey: process.env.HEXAI_API_KEY,
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
      maxTokens: 16000,
    },
  }),
  signal: AbortSignal.timeout(600000),
});
console.log(`HTTP ${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const j = await r.json();
if (j.error) { console.error('ERR:', j.error); process.exit(1); }

const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let total = 0, maxD = 0;
function walk(n, d = 1) {
  total++;
  maxD = Math.max(maxD, d);
  if (d <= 5) dist[d] = (dist[d] || 0) + 1;
  (n.children || []).forEach((c) => walk(c, d + 1));
}
(j.wbs.wbs || []).forEach((n) => walk(n));

console.log('\n=== WBS 深度统计 ===');
console.log(`总节点: ${total}, 最深: L${maxD}`);
console.log('层级分布:', dist);
console.log('durationWeeks:', j.wbs.meta?.durationWeeks);
console.log('milestones:', j.wbs.milestones?.length);
console.log('requirements:', j.wbs.requirements?.length);
console.log('rtm:', j.wbs.rtm?.length);
console.log('lifecyclePhases:', j.wbs.lifecyclePhases?.length);

await fs.writeFile('/tmp/wbs-hexai.json', JSON.stringify(j.wbs, null, 2));
console.log('\n✅ 保存到 /tmp/wbs-hexai.json');

// 列出前 20 节点名（看 L4-L5 内容）
const nodes = [];
function collect(n, d = 1) {
  nodes.push({ d, code: n.code, name: n.name, kids: n.children?.length || 0 });
  (n.children || []).forEach((c) => collect(c, d + 1));
}
(j.wbs.wbs || []).forEach((n) => collect(n));
console.log('\n=== 节点列表 (前 40) ===');
nodes.slice(0, 40).forEach((n) => {
  console.log(`  L${n.d} ${n.code.padEnd(12)} ${n.name} (kids=${n.kids})`);
});
console.log(`  ... 共 ${nodes.length} 个节点`);