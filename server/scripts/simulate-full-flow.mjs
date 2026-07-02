// 模拟前端完整流程：上传 → 生成 → 验证 WBS 层级展示
// 涵盖 /api/upload → /api/generate → 解析 → 校验 → 打印 L1-L5 树
import fs from 'node:fs/promises';

const BASE = 'http://localhost:8787';
const docxPath = '/Users/lzg/Downloads/二.docx';

function log(stage, msg, data) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${ts}] ${stage.padEnd(8)} | ${msg}`);
  if (data) console.log('         ', JSON.stringify(data).slice(0, 200));
}

console.log('=================================================================');
console.log('  SOW → WBS 完整流程模拟');
console.log('  文档：', docxPath);
console.log('  后端：', BASE);
console.log('=================================================================\n');

const t_total = Date.now();

// ====== 1. 上传 SOW ======
log('upload', '→ POST /api/upload');
const fd = new FormData();
const buf = await fs.readFile(docxPath);
fd.append('file', new Blob([buf]), '二.docx');
const t0 = Date.now();
const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: fd });
const upJ = await upRes.json();
log('upload', `← ${upRes.status} (${Date.now() - t0}ms)`, {
  filename: upJ.filename,
  chars: upJ.text?.length,
  preview: upJ.text?.slice(0, 80) + '...',
});

if (!upJ.text) {
  console.error('❌ 上传失败');
  process.exit(1);
}

// ====== 2. 配置 LLM ======
const llmConfig = {
  provider: 'claude_hexai',
  baseUrl: 'https://crs.hexai.cn/api/v1',
  apiKey: process.env.HEXAI_API_KEY,
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
  maxTokens: 32000,  // v2.6 提升
};

console.log('\n');
log('config', 'LLM 配置', llmConfig);

// ====== 3. 调用 /api/generate ======
log('generate', '→ POST /api/generate');
const sowText = upJ.text.slice(0, 1500);  // 与前端保持一致
log('generate', `SOW 长度 ${sowText.length} 字符`);

const t1 = Date.now();
const genRes = await fetch(`${BASE}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sowText, llmConfig }),
  signal: AbortSignal.timeout(600000),  // 10 分钟超时
});
log('generate', `← HTTP ${genRes.status} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

const j = await genRes.json();
if (j.error || !j.wbs) {
  console.error('\n❌ 生成失败：');
  console.error('error:', j.error?.slice(0, 500));
  process.exit(1);
}

// ====== 4. 验证 WBS 结构 ======
console.log('\n=================================================================');
console.log('  WBS 解析结果');
console.log('=================================================================\n');

log('parse', `方法: ${j.meta?.parseMethod || '?'}`, {
  parseWarning: j.meta?.parseWarning,
});
log('parse', `顶层 keys: ${Object.keys(j.wbs).join(', ')}`);
log('parse', `meta.projectName: ${j.wbs.meta?.projectName}`);
log('parse', `lifecyclePhases: ${j.wbs.lifecyclePhases?.length || 0} 个`);
log('parse', `milestones: ${j.wbs.milestones?.length ?? '(null)'}`);
log('parse', `requirements: ${j.wbs.requirements?.length ?? '(null)'}`);
log('parse', `rtm: ${j.wbs.rtm?.length ?? '(null)'}`);

// ====== 5. 遍历统计 L1-L5 ======
const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
let total = 0,
  leaves = 0,
  hours = 0,
  maxDepth = 0;
function walk(n, d = 1) {
  total++;
  maxDepth = Math.max(maxDepth, d);
  if (d <= 5) dist[d] = (dist[d] || 0) + 1;
  else dist[6] = (dist[6] || 0) + 1;
  if (!n.children?.length) leaves++;
  hours += n.estimatedHours || 0;
  n.children?.forEach((c) => walk(c, d + 1));
}
(j.wbs.wbs || []).forEach((n) => walk(n));

console.log('\n┌─────────────────────────────────────┐');
console.log('│         📊 WBS 层级统计              │');
console.log('├─────────────────────────────────────┤');
console.log(`│ 🌿 L1 阶段          : ${String(dist[1]).padStart(3)} 个       │`);
console.log(`│ 📦 L2 主要交付物    : ${String(dist[2]).padStart(3)} 个       │`);
console.log(`│ 🔧 L3 工作包        : ${String(dist[3]).padStart(3)} 个       │`);
console.log(`│ 📑 L4 子任务        : ${String(dist[4]).padStart(3)} 个       │`);
console.log(`│ 🎯 L5 叶子节点      : ${String(dist[5]).padStart(3)} 个       │`);
console.log(`│ ➕ L6+              : ${String(dist[6]).padStart(3)} 个       │`);
console.log('├─────────────────────────────────────┤');
console.log(`│ 📊 总节点 / 叶子    : ${total} / ${leaves}           │`);
console.log(`│ ⏱️  总工时          : ${hours}h              │`);
console.log(`│ 📏 最深层级         : L${maxDepth}                │`);
console.log('└─────────────────────────────────────┘');

// ====== 6. 守恒校验 ======
const sum = dist[1] + dist[2] + dist[3] + dist[4] + dist[5] + dist[6];
const ok = sum === total;
console.log(`\n${ok ? '✅' : '❌'} 守恒校验: L1+...+L6 = ${sum}, total = ${total} ${ok ? '一致' : '不一致'}`);

// ====== 7. 列出每个 L1 节点 + 子树概览 ======
console.log('\n=== 🌳 L1 节点概览 ===');
(j.wbs.wbs || []).forEach((root) => {
  let sub = 0,
    subL = 0,
    subH = 0;
  (function w(n) {
    sub++;
    if (!n.children?.length) subL++;
    subH += n.estimatedHours || 0;
    n.children?.forEach(w);
  })(root);
  console.log(
    `  [${(root.code || '').padEnd(6)}] ${root.name.padEnd(20)} L${root.level}  ${sub} 节点 / ${subL} 叶子 / ${subH}h`
  );
});

// ====== 8. 模拟前端展示效果：打印前 3 层树 ======
console.log('\n=== 🎨 模拟前端 WBS 树展示（前 3 层） ===');
function renderNode(n, depth = 0) {
  const indent = '  '.repeat(depth);
  const icon = depth === 0 ? '🌿' : depth === 1 ? '📦' : depth === 2 ? '🔧' : depth === 3 ? '📑' : '🎯';
  const code = (n.code || '').padEnd(10);
  const name = n.name?.slice(0, 30) || '(no name)';
  const hrs = n.estimatedHours ? ` ${n.estimatedHours}h` : '';
  console.log(`${indent}${icon} L${depth + 1} ${code} ${name}${hrs}`);
  n.children?.forEach((c) => renderNode(c, depth + 1));
}
(j.wbs.wbs || []).forEach((root) => {
  renderNode(root);
  console.log('');
});

// ====== 9. 列出后端日志 ======
console.log('=== 📋 后端日志关键节点 ===');
if (j.log) {
  const critical = j.log.filter((l) =>
    ['start', 'parse.ok', 'parse.fail', 'parse.repaired', 'parse.continue', 'truncated', 'validate.done', 'end'].includes(l.stage)
  );
  critical.forEach((l) => {
    const symbol = l.level === 'error' ? '❌' : l.level === 'warn' ? '⚠️' : '✓';
    console.log(`  ${symbol} [${l.stage}] ${l.msg?.slice(0, 100)}`);
  });
}

const totalSec = ((Date.now() - t_total) / 1000).toFixed(1);
console.log(`\n=================================================================`);
console.log(`  ✅ 全流程完成，总耗时 ${totalSec}s`);
console.log(`=================================================================`);

// ====== 10. 保存结果 ======
await fs.writeFile('/tmp/wbs-simulated.json', JSON.stringify(j.wbs, null, 2));
console.log('💾 完整 WBS 已保存到 /tmp/wbs-simulated.json');