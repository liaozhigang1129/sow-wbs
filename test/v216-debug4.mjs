
import { validateWBS } from "/Users/lzg/Documents/trae_projects/SOW_WBS 2/server/src/utils/validator.js";

const t = {
  meta: { projectName: "T", projectCode: "T-1", durationWeeks: 12, durationMonths: 3, startDate: "2024-01", budgetManMonth: 30, teamSize: 5, summary: "T" },
  lifecyclePhases: ["P1", "P2", "P3", "P4", "P5"],
  requirements: [{section: "1", text: "r"}, {section: "2", text: "r"}, {section: "3", text: "r"}, {section: "4", text: "r"}, {section: "5", text: "r"}],
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
const r = validateWBS(t);
console.log("byLevel:", JSON.stringify(r.stats.byLevel));
console.log("maxDepth:", r.stats.maxDepth);
console.log("leaves:", r.stats.leaves);
console.log("errors:", r.errors);
console.log("warnings:", r.warnings);
