
// 复现 computeNameOverlap
function computeNameOverlap(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  if (nameA === nameB) return 1;
  const STOPWORDS = new Set([
    '的', '与', '和', '及', '或', '等', '等。', '进行', '完成', '相关',
    '总体', '整体', '系统', '项目', '工作',
  ]);
  function tokenize(name) {
    const tokens = new Set();
    const cn = name.match(/[一-龥]+/g) || [];
    for (const seg of cn) {
      for (let i = 0; i < seg.length - 1; i++) {
        const t = seg.slice(i, i + 2);
        if (!STOPWORDS.has(t)) tokens.add(t);
      }
    }
    const en = name.match(/[A-Za-z0-9]+/g) || [];
    for (const t of en) {
      if (t.length >= 2 && !STOPWORDS.has(t.toLowerCase())) tokens.add(t.toLowerCase());
    }
    return tokens;
  }
  const setA = tokenize(nameA);
  const setB = tokenize(nameB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

console.log("=== 重合度算法测试 ===");
const tests = [
  ["需求调研报告", "需求调研与访谈纪要", "应高重合（>60%）"],
  ["需求调研报告", "需求评审纪要", "应低重合"],
  ["需求调研", "需求调研与访谈", "应高重合"],
  ["XX 设计", "XX 详细设计", "应高重合"],
  ["架构设计文档", "架构评审报告", "应中等重合"],
  ["需求调研报告", "需求规格说明书", "应中等"],
  ["测试报告", "性能测试报告", "应中等（设计文档 v 测试报告）"],
  ["数据迁移", "系统集成测试", "应低重合"],
  ["访谈计划编制", "访谈提纲设计", "应低重合"],
  ["流水解析模块", "问询引擎实现", "应低重合"],
  ["PS 篡改检测", "PS 篡改识别", "应高重合"],
];

for (const [a, b, expect] of tests) {
  const overlap = computeNameOverlap(a, b);
  const status = overlap > 0.6 ? "🔴 重合" : overlap > 0.3 ? "🟡 中等" : "✅ 不重合";
  console.log(`  '${a}' vs '${b}' = ${(overlap * 100).toFixed(0)}% ${status} | ${expect}`);
}
