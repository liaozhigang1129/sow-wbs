// 真实生成 E2E：hexai + Claude Sonnet 4
import fs from 'node:fs/promises';

const fd = new FormData();
const buf = await fs.readFile('/Users/lzg/Downloads/二.docx');
fd.append('file', new Blob([buf]), '二.docx');

const upRes = await fetch('http://localhost:8787/api/upload', { method: 'POST', body: fd });
const upJ = await upRes.json();
console.log('✅ 上传:', upJ.text?.length, '字符');

const sowText = upJ.text.slice(0, 1500);

console.log('🚀 调用 Claude Sonnet 4 via hexai ...');
const t0 = Date.now();
const genRes = await fetch('http://localhost:8787/api/generate', {
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
});
const dt = ((Date.now() - t0) / 1000).toFixed(1);
const genJ = await genRes.json();
if (genJ.error) { console.error('❌ ERR:', genJ.error); process.exit(1); }

console.log(`✅ 返回 (${dt}s)`);
console.log('顶层 keys:', Object.keys(genJ.wbs));

const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let total = 0, maxD = 0;
function walk(n, d = 1) {
  total++;
  maxD = Math.max(maxD, d);
  if (d <= 5) dist[d] = (dist[d] || 0) + 1;
  (n.children || []).forEach((c) => walk(c, d + 1));
}
(genJ.wbs.wbs || []).forEach((n) => walk(n));

console.log(`\n=== WBS 深度统计 ===`);
console.log(`总节点: ${total}, 最深: L${maxD}`);
console.log('层级分布:', dist);
console.log('durationWeeks:', genJ.wbs.meta?.durationWeeks);
console.log('milestones:', genJ.wbs.milestones?.length);

await fs.writeFile('/tmp/wbs-hexai.json', JSON.stringify(genJ.wbs, null, 2));
console.log('✅ 保存到 /tmp/wbs-hexai.json');