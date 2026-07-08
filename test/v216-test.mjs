
import { validateWBS } from "/Users/lzg/Documents/trae_projects/SOW_WBS 2/server/src/utils/validator.js";

function makeMeta() {
  return {
    projectName: "测试项目",
    projectCode: "TEST-001",
    durationWeeks: 12,
    durationMonths: 3,
    startDate: "2024-01",
    budgetManMonth: 30,
    teamSize: 5,
    summary: "测试"
  };
}

// 测试 1：v2.16 弹性层级 — L3 直接作为叶子（应通过）
console.log("\n=== 测试 1: L3 作为叶子（v2.16 弹性层级）===");
const t1 = {
  meta: makeMeta(),
  lifecyclePhases: ["启动阶段", "需求阶段", "设计阶段", "实施阶段", "上线阶段"],
  requirements: [{section: "1", text: "r1"}, {section: "2", text: "r2"}, {section: "3", text: "r3"}, {section: "4", text: "r4"}, {section: "5", text: "r5"}],
  rtm: [{requirementId: "r1", wbsId: "WBS-1.1.1", role: "R"}, {requirementId: "r2", wbsId: "WBS-1.1.1", role: "R"}],
  wbs: [{
    id: "WBS-1", code: "1", name: "项目总览", level: 1, estimatedHours: 40,
    children: [{
      id: "WBS-1.1", code: "1.1", name: "需求调研报告", level: 2, estimatedHours: 40,
      children: [{
        id: "WBS-1.1.1", code: "1.1.1", name: "需求调研报告", level: 3,
        estimatedHours: 40, deliverable: "调研报告", owner: "BA",
        sowEvidence: "1. 项目背景"
      }]
    }]
  }]
};
const r1 = validateWBS(t1);
console.log("errors:", r1.errors.length, "| warnings:", r1.warnings.length, "| passed:", r1.passed);
if (r1.errors.length) r1.errors.forEach(e => console.log("  ERR:", e));
if (r1.warnings.length) r1.warnings.forEach(w => console.log("  WARN:", w));

// 测试 2：L3 工作包语义重合（应报错）
console.log("\n=== 测试 2: L3 工作包语义重合（应报错）===");
const t2 = {
  meta: makeMeta(),
  lifecyclePhases: ["启动阶段", "需求阶段", "设计阶段", "实施阶段", "上线阶段"],
  requirements: [{section: "1", text: "r1"}, {section: "2", text: "r2"}, {section: "3", text: "r3"}, {section: "4", text: "r4"}, {section: "5", text: "r5"}],
  rtm: [{requirementId: "r1", wbsId: "WBS-1.1.1", role: "R"}, {requirementId: "r1", wbsId: "WBS-1.1.2", role: "R"}],
  wbs: [{
    id: "WBS-1", code: "1", name: "项目总览", level: 1, estimatedHours: 160,
    children: [{
      id: "WBS-1.1", code: "1.1", name: "需求管理模块", level: 2, estimatedHours: 160,
      children: [
        { id: "WBS-1.1.1", code: "1.1.1", name: "需求调研报告", level: 3, estimatedHours: 80,
          deliverable: "调研报告", owner: "BA", sowEvidence: "1. 项目背景" },
        { id: "WBS-1.1.2", code: "1.1.2", name: "需求调研与访谈纪要", level: 3, estimatedHours: 80,
          deliverable: "访谈纪要", owner: "BA", sowEvidence: "1. 项目背景" }
      ]
    }]
  }]
};
const r2 = validateWBS(t2);
console.log("errors:", r2.errors.length);
r2.errors.forEach(e => console.log("  ERR:", e));

// 测试 3：不同语义的 L3（应通过）
console.log("\n=== 测试 3: 不同语义 L3（应通过）===");
const t3 = {
  meta: makeMeta(),
  lifecyclePhases: ["启动阶段", "需求阶段", "设计阶段", "实施阶段", "上线阶段"],
  requirements: [{section: "1", text: "r1"}, {section: "2", text: "r2"}, {section: "3", text: "r3"}, {section: "4", text: "r4"}, {section: "5", text: "r5"}],
  rtm: [{requirementId: "r1", wbsId: "WBS-1.1.1", role: "R"}, {requirementId: "r2", wbsId: "WBS-1.1.2", role: "R"}, {requirementId: "r3", wbsId: "WBS-1.1.3", role: "R"}],
  wbs: [{
    id: "WBS-1", code: "1", name: "项目总览", level: 1, estimatedHours: 200,
    children: [{
      id: "WBS-1.1", code: "1.1", name: "需求管理模块", level: 2, estimatedHours: 200,
      children: [
        { id: "WBS-1.1.1", code: "1.1.1", name: "需求调研报告", level: 3, estimatedHours: 80,
          deliverable: "调研报告", owner: "BA", sowEvidence: "1. 项目背景" },
        { id: "WBS-1.1.2", code: "1.1.2", name: "需求评审纪要", level: 3, estimatedHours: 60,
          deliverable: "评审纪要", owner: "PM", sowEvidence: "1. 项目背景" },
        { id: "WBS-1.1.3", code: "1.1.3", name: "SRS 需求规格说明书", level: 3, estimatedHours: 60,
          deliverable: "SRS", owner: "BA", sowEvidence: "1. 项目背景" }
      ]
    }]
  }]
};
const r3 = validateWBS(t3);
console.log("errors:", r3.errors.length, "| warnings:", r3.warnings.length);
if (r3.errors.length) r3.errors.forEach(e => console.log("  ERR:", e));

// 测试 4：L3 工时 150h（>120h 但 SOW 无子项，warning）
console.log("\n=== 测试 4: L3 工时 150h 无子项（warning）===");
const t4 = {
  meta: makeMeta(),
  lifecyclePhases: ["启动阶段", "需求阶段", "设计阶段", "实施阶段", "上线阶段"],
  requirements: [{section: "1", text: "r1"}, {section: "2", text: "r2"}, {section: "3", text: "r3"}, {section: "4", text: "r4"}, {section: "5", text: "r5"}],
  rtm: [{requirementId: "r1", wbsId: "WBS-1.1.1", role: "R"}],
  wbs: [{
    id: "WBS-1", code: "1", name: "项目总览", level: 1, estimatedHours: 150,
    children: [{
      id: "WBS-1.1", code: "1.1", name: "需求管理模块", level: 2, estimatedHours: 150,
      children: [{
        id: "WBS-1.1.1", code: "1.1.1", name: "需求调研报告", level: 3, estimatedHours: 150,
        deliverable: "调研报告", owner: "BA", sowEvidence: "1. 项目背景"
      }]
    }]
  }]
};
const r4 = validateWBS(t4);
console.log("errors:", r4.errors.length, "| warnings:", r4.warnings.length);
r4.warnings.forEach(w => console.log("  WARN:", w));

// 测试 5：L3 工时 200h（必须分解，error）
console.log("\n=== 测试 5: L3 工时 200h（error）===");
const t5 = {
  meta: makeMeta(),
  lifecyclePhases: ["启动阶段", "需求阶段", "设计阶段", "实施阶段", "上线阶段"],
  requirements: [{section: "1", text: "r1"}, {section: "2", text: "r2"}, {section: "3", text: "r3"}, {section: "4", text: "r4"}, {section: "5", text: "r5"}],
  rtm: [{requirementId: "r1", wbsId: "WBS-1.1.1", role: "R"}],
  wbs: [{
    id: "WBS-1", code: "1", name: "项目总览", level: 1, estimatedHours: 200,
    children: [{
      id: "WBS-1.1", code: "1.1", name: "需求管理模块", level: 2, estimatedHours: 200,
      children: [{
        id: "WBS-1.1.1", code: "1.1.1", name: "需求调研报告", level: 3, estimatedHours: 200,
        deliverable: "调研报告", owner: "BA", sowEvidence: "1. 项目背景"
      }]
    }]
  }]
};
const r5 = validateWBS(t5);
console.log("errors:", r5.errors.length);
r5.errors.forEach(e => console.log("  ERR:", e));
