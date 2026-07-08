
function computeNameOverlapV2(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  if (nameA === nameB) return 1;

  const STOPWORDS = new Set([
    '的', '与', '和', '及', '或', '等', '进行', '完成', '相关',
    '总体', '整体', '系统', '项目', '工作', '报告', '文档',
    '纪要', '方案', '模板', '规范', '工具', '服务', '平台',
  ]);

  function tokenize(name) {
    const tokens = [];
    // 中文：滑动窗口 2-gram
    const cn = name.match(/[一-龥]+/g) || [];
    for (const seg of cn) {
      for (let i = 0; i < seg.length - 1; i++) {
        const t = seg.slice(i, i + 2);
        if (!STOPWORDS.has(t)) tokens.push(t);
      }
      // 也保留 3-gram（更精确）
      for (let i = 0; i < seg.length - 2; i++) {
        const t = seg.slice(i, i + 3);
        if (!STOPWORDS.has(t)) tokens.push(t);
      }
    }
    // 英文
    const en = name.match(/[A-Za-z0-9]+/g) || [];
    for (const t of en) {
      if (t.length >= 2 && !STOPWORDS.has(t.toLowerCase())) tokens.push(t.toLowerCase());
    }
    return tokens;
  }

  const listA = tokenize(nameA);
  const listB = tokenize(nameB);
  const setA = new Set(listA);
  const setB = new Set(listB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const min = Math.min(setA.size, setB.size);
  const max = Math.max(setA.size, setB.size);

  // v2: 用"包含率" = intersection / min(size)
  //     如果较小集合的 50%+ 关键词都在较大集合里 → 重合
  const containment = intersection / min;

  // 同时也考虑子串包含（如 "需求调研" 是 "需求调研与访谈" 的子串）
  if (nameA.includes(nameB) || nameB.includes(nameA)) {
    return Math.max(containment, 0.5);
  }

  return containment;
}

console.log("=== 改进版算法测试 ===");
const tests = [
  ["需求调研报告", "需求调研与访谈纪要", "应高重合"],
  ["需求调研报告", "需求评审纪要", "应低重合"],
  ["需求调研", "需求调研与访谈", "应高重合"],
  ["架构设计", "架构详细设计", "应高重合"],
  ["架构设计文档", "架构评审报告", "应低-中"],
  ["测试报告", "性能测试报告", "应高重合"],
  ["数据迁移", "系统集成测试", "应低"],
  ["PS 篡改检测", "PS 篡改识别", "应高重合"],
  ["访谈计划编制", "访谈提纲设计", "应低"],
  ["流水解析模块", "问询引擎实现", "应低"],
  ["需求调研报告", "需求规格说明书", "应低-中"],
  ["架构设计报告", "架构设计文档", "应高"],
  ["需求分析", "需求评审", "应低"],
  ["需求分析", "需求调研", "应低"],
  ["需求调研", "需求分析", "应低-中（语义相关）"],
  ["设计文档", "设计报告", "应高"],
];

for (const [a, b, expect] of tests) {
  const overlap = computeNameOverlapV2(a, b);
  const status = overlap > 0.6 ? "🔴 重合" : overlap > 0.4 ? "🟡 中等" : "✅ 不重合";
  console.log(`  '${a}' vs '${b}' = ${(overlap * 100).toFixed(0)}% ${status} | ${expect}`);
}
