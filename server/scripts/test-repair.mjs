// 复现 parse.fail：测试修补函数在 L5 截断时的表现
import { tryRepairTruncatedJSON, extractJSON } from '../src/services/llm.js';

// 模拟截断在 key 中间（"name 写一半）
const truncated = `{"meta":{"projectCode":"AMC-2024-OTMS","projectName":"资产托管运营智慧化管理系统建设项目","projectType":"Hybrid","client":"某金融机构","durationWeeks":22,"durationMonths":5,"startDate":"2024-09","budgetManMonth":36,"teamSize":6,"summary":"建设托管运营智慧化管理系统，含文件智能管理与质效管理两大模块"},"lifecyclePhases":["启动阶段","规划阶段","需求与设计阶段","敏捷迭代实施阶段","测试与部署阶段","收尾与运维阶段"],"wbs":[{"id":"WBS-1","parentId":"","code":"1","name":"启动阶段","level":1,"nameType":"phase","estimatedHours":120,"children":[{"id":"WBS-1.1","parentId":"WBS-1","code":"1.1","name`;

console.log('原文本长度:', truncated.length, '字符');
console.log('末尾 100 字符:', JSON.stringify(truncated.slice(-100)));

const t0 = Date.now();
const r1 = tryRepairTruncatedJSON(truncated);
console.log('\n=== tryRepairTruncatedJSON ===');
console.log('耗时:', Date.now() - t0, 'ms');
if (r1) {
  console.log('✅ 修补成功，keys:', Object.keys(r1));
  console.log('  wbs 节点数:', r1.wbs?.length);
  console.log('  wbs[0].children 长度:', r1.wbs?.[0]?.children?.length);
  // 看下能否保留到 L2
  const l2 = r1.wbs?.[0]?.children?.[0];
  if (l2) {
    console.log('  L2 节点 name:', l2.name);
    console.log('  L2 children 长度:', l2.children?.length);
  }
} else {
  console.log('❌ 修补失败');
}
