// Node 端复刻浏览器控制台的调试脚本（用真实 hexai 数据 /tmp/wbs-hexai.json）
// 让你不打开浏览器也能验证 WbsStats 修复后逻辑的输出
import fs from 'node:fs/promises';

const wbs = JSON.parse(await fs.readFile('/tmp/wbs-hexai.json', 'utf-8'));

console.log('📦 API 返回顶层 keys:', Object.keys(wbs));
console.log('  ├ meta:', wbs.meta ? Object.keys(wbs.meta) : '(none)');
console.log('  ├ lifecyclePhases:', wbs.lifecyclePhases?.length || 0, '个');
console.log('  ├ wbs 根节点数:', wbs.wbs?.length || 0);
console.log('  ├ milestones:', wbs.milestones?.length ?? '(null)');
console.log('  ├ requirements:', wbs.requirements?.length ?? '(null)');
console.log('  └ rtm:', wbs.rtm?.length ?? '(null)');

const out = { total: 0, leaves: 0, hours: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
const fieldStats = { hasLevel: 0, hasChildren: 0, hasHours: 0, hoursFieldNames: {} };
let maxDepth = 0;

function walk(n, d = 1) {
  if (!n) return;
  out.total++;
  maxDepth = Math.max(maxDepth, d);
  if (typeof n.level === 'number') fieldStats.hasLevel++;
  if (Array.isArray(n.children)) fieldStats.hasChildren++;

  let lv;
  if (n.level >= 1 && n.level <= 5) lv = n.level;
  else if (d >= 1 && d <= 5) lv = d;
  else lv = 6;
  out.byLevel[lv] = (out.byLevel[lv] || 0) + 1;

  for (const k of ['estimatedHours', 'hours', 'effortHours', 'durationHours']) {
    if (typeof n[k] === 'number') {
      fieldStats.hoursFieldNames[k] = (fieldStats.hoursFieldNames[k] || 0) + 1;
      if (n[k] > 0) {
        fieldStats.hasHours++;
        out.hours += n[k];
      }
      break;
    }
  }

  if (Array.isArray(n.children) && n.children.length > 0) {
    n.children.forEach((c) => walk(c, d + 1));
  } else {
    out.leaves++;
  }
}
(wbs.wbs || []).forEach((n) => walk(n));

const distByDepth = {};
(function walkDepth(n, d = 1) {
  if (!n) return;
  distByDepth[d] = (distByDepth[d] || 0) + 1;
  (n.children || []).forEach((c) => walkDepth(c, d + 1));
})(((wbs.wbs || [])[0]) || null);

console.log('\n=== 🔍 字段覆盖率 ===');
console.log(
  `  有 level 字段: ${fieldStats.hasLevel}/${out.total} (${((fieldStats.hasLevel / out.total) * 100).toFixed(1)}%)`
);
console.log(
  `  有 children 数组: ${fieldStats.hasChildren}/${out.total} (${((fieldStats.hasChildren / out.total) * 100).toFixed(1)}%)`
);
console.log('  小时数字段分布:', fieldStats.hoursFieldNames);

console.log('\n=== 📊 UI 显示（修复后逻辑） ===');
console.table({
  '🌿 L1 阶段': out.byLevel[1],
  '📦 L2 主要交付物': out.byLevel[2],
  '🔧 L3 工作包': out.byLevel[3],
  '📑 L4 子任务': out.byLevel[4],
  '🎯 L5 叶子': out.byLevel[5],
  '➕ L6+': out.byLevel[6],
  '📊 总节点': out.total,
  '🍃 叶子节点': out.leaves,
  '⏱️ 总工时 (h)': out.hours,
  '📏 最深层级': 'L' + maxDepth,
});

console.log('\n=== 🌲 实际递归深度（与 level 字段独立）===');
console.table(distByDepth);

const sum = out.byLevel[1] + out.byLevel[2] + out.byLevel[3] + out.byLevel[4] + out.byLevel[5] + out.byLevel[6];
console.log(
  `\n${sum === out.total ? '✅' : '❌'} byLevel 守恒校验: L1+L2+...+L6 = ${sum}, total = ${out.total} ${sum === out.total ? '一致' : '不一致'}`
);

console.log('\n=== 🌳 L1 节点概览 ===');
(wbs.wbs || []).forEach((root) => {
  let subTotal = 0,
    subLeaves = 0;
  (function w(n) {
    if (!n) return;
    subTotal++;
    if (!n.children?.length) subLeaves++;
    else n.children.forEach(w);
  })(root);
  console.log(
    `  [${root.code}] ${root.name}  L${root.level}  ${subTotal} 节点 / ${subLeaves} 叶子 / ${root.estimatedHours ?? '-'}h`
  );
});
