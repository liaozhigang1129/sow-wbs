
import { validateWBS } from "/Users/lzg/Documents/trae_projects/SOW_WBS 2/server/src/utils/validator.js";

const t = {
  meta: {
    projectName: "测试", projectCode: "T-1", durationWeeks: 12, durationMonths: 3,
    startDate: "2024-01", budgetManMonth: 30, teamSize: 5, summary: "测试"
  },
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
const r = validateWBS(t);
console.log("errors:", r.errors.length);
r.errors.forEach(e => console.log("  ERR:", e));
