// 模拟真实截断场景：把 /tmp/wbs-hexai.json 模拟成截断在 L5 末尾
import fs from 'node:fs/promises';
import { tryRepairTruncatedJSON, extractJSON } from '../src/services/llm.js';

const wbs = JSON.parse(await fs.readFile('/tmp/wbs-hexai.json', 'utf-8'));
const full = JSON.stringify(wbs);
console.log('完整 WBS 长度:', full.length, '字符');

// 截断 30% / 50% / 70% 模拟不同程度截断
for (const pct of [0.3, 0.5, 0.7]) {
  const cut = Math.floor(full.length * pct);
  const truncated = full.slice(0, cut);
  console.log(`\n=== 截断到 ${(pct * 100).toFixed(0)}% (${cut} 字符) ===`);
  const t0 = Date.now();
  const r = tryRepairTruncatedJSON(truncated);
  console.log(`耗时: ${Date.now() - t0}ms, 结果:`, r ? '✅ 成功' : '❌ 失败');
  if (r) {
    const wbsArr = r.wbs || [];
    const l1 = wbsArr.length;
    let l2 = 0, l3 = 0, l4 = 0, l5 = 0;
    (function walk(n, d) {
      if (d === 2) l2++;
      else if (d === 3) l3++;
      else if (d === 4) l4++;
      else if (d >= 5) l5++;
      (n.children || []).forEach((c) => walk(c, d + 1));
    })(wbsArr[0] || {}, 1);
    console.log(`  恢复层级: L1=${l1} L2=${l2} L3=${l3} L4=${l4} L5=${l5}`);
  } else {
    console.log(`  末尾 50 字符:`, JSON.stringify(truncated.slice(-50)));
  }
}
