
import { computeNameOverlap } from "/Users/lzg/Documents/trae_projects/SOW_WBS 2/server/src/utils/validator.js";

console.log("=== computeNameOverlap 测试 ===");
const tests = [
  ["需求调研报告", "需求调研与访谈纪要"],
  ["需求调研报告", "需求评审纪要"],
  ["需求调研", "需求调研与访谈"],
  ["XX 设计", "XX 详细设计"],
  ["架构设计文档", "架构评审报告"],
  ["需求调研报告", "需求规格说明书"],
  ["测试报告", "性能测试报告"],
  ["数据迁移", "系统集成测试"],
];

for (const [a, b] of tests) {
  const overlap = computeNameOverlap(a, b);
  const status = overlap > 0.6 ? "🔴 重合" : "✅ 不重合";
  console.log(`  '${a}' vs '${b}' = ${(overlap * 100).toFixed(0)}% ${status}`);
}
