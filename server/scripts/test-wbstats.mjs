// 用 /tmp/wbs-hexai.json 实测 App.jsx 中的 WbsStats 递归逻辑
import fs from 'node:fs/promises';

const wbs = JSON.parse(await fs.readFile('/tmp/wbs-hexai.json', 'utf-8'));

console.log('=== API 返回顶层 keys ===');
console.log(Object.keys(wbs));
console.log('wbs.wbs 长度:', (wbs.wbs || []).length);
console.log('wbs.wbs[0] 字段:', Object.keys(wbs.wbs?.[0] || {}));

// ⭐ 复刻 App.jsx 的 WbsStats 逻辑
const out = { total: 0, leaves: 0, hours: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
let maxDepth = 0;
function walk(n, d = 1) {
  if (!n) return;
  out.total++;
  maxDepth = Math.max(maxDepth, d);
  const lv = n.level || (n.children?.length ? 2 : 3);
  out.byLevel[lv] = (out.byLevel[lv] || 0) + 1;
  if (Array.isArray(n.children) && n.children.length > 0) {
    n.children.forEach((c) => walk(c, d + 1));
  } else {
    out.leaves++;
  }
  if (typeof n.estimatedHours === 'number') out.hours += n.estimatedHours;
}
(wbs.wbs || []).forEach((n) => walk(n));

console.log('\n=== 复刻 WbsStats 统计结果 ===');
console.log('total:', out.total);
console.log('leaves:', out.leaves);
console.log('hours:', out.hours);
console.log('byLevel:', out.byLevel);
console.log('maxDepth:', maxDepth);

console.log('\n=== 真实 wbs.wbs 树结构 ===');
function dump(n, d = 0) {
  const ind = '  '.repeat(d);
  console.log(`${ind}├ L${n.level ?? '?'} [${n.code ?? ''}] ${n.name} (kids=${n.children?.length || 0}, hrs=${n.estimatedHours ?? '-'})`);
  (n.children || []).forEach((c) => dump(c, d + 1));
}
(wbs.wbs || []).forEach((n) => dump(n));

// ⭐ 对比：用 d 参数统计（更准确，不依赖 level 字段）
const distByDepth = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, '6+': 0 };
function walkDepth(n, d = 1) {
  const key = d > 5 ? '6+' : d;
  distByDepth[key]++;
  (n.children || []).forEach((c) => walkDepth(c, d + 1));
}
(wbs.wbs || []).forEach((n) => walkDepth(n));
console.log('\n=== 用递归深度 d 统计（更准） ===');
console.log(distByDepth);