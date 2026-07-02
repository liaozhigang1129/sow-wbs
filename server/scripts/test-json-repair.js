// 验证 tryRepairTruncatedJSON 的各类截断修复能力
import { tryRepairTruncatedJSON, extractJSON } from '../src/services/llm.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log(`✅ ${name}`); pass++; }
  else { console.log(`❌ ${name}${extra ? ' — ' + extra : ''}`); fail++; }
}

const cases = [
  // [名字, 输入, 期望修复结果的部分字段校验函数]
  [
    'A1 字符串值未闭合',
    `{"meta":{"name":"资产托管业务`,
    (r) => r.meta.name === '资产托管业务',
  ],
  [
    'A2 字符串值未闭合（含中文逗号）',
    `{"meta":{"client":"某金融机构，`,
    (r) => r.meta.client === '某金融机构，',
  ],
  [
    'B1 字段无值（您报错场景）',
    `{"meta":{"projectCode":"AMCS-2024","projectName":"资产托管业务综合管理系统建设项目","client":"某金融机构采购人","durationWeeks":`,
    (r) => r.meta.projectCode === 'AMCS-2024' && r.meta.projectName === '资产托管业务综合管理系统建设项目' && r.meta.durationWeeks === null,
  ],
  [
    'B2 嵌套对象字���无值',
    `{"wbs":[{"id":"WBS-1","children":[`,
    (r) => Array.isArray(r.wbs) && r.wbs[0].id === 'WBS-1' && Array.isArray(r.wbs[0].children),
  ],
  [
    'C1 数组元素残缺',
    `{"wbs":[{"id":"WBS-1","hours":40},`,
    (r) => r.wbs.length >= 1 && r.wbs[0].id === 'WBS-1',
  ],
  [
    'D1 仅开头 {',
    `{`,
    (r) => typeof r === 'object' && r !== null,
  ],
  [
    'D2 仅 [{',
    `[{`,
    (r) => typeof r === 'object' && r !== null, // [{ 是无效 JSON，降级为空对象或空数组都接受
  ],
  [
    'E1 数组闭合但整体未闭',
    `{"wbs":[{"id":"WBS-1","hours":40}]`,
    (r) => r.wbs[0].id === 'WBS-1',
  ],
  [
    'F1 末尾多余逗号',
    `{"a":1,`,
    (r) => r.a === 1,
  ],
  [
    'G1 正常完整 JSON（不应破坏）',
    `{"meta":{"a":1},"wbs":[{"id":"WBS-1","hours":40}]}`,
    (r) => r.meta.a === 1 && r.wbs[0].hours === 40,
  ],
  [
    'G2 含转义符的完整 JSON',
    `{"name":"测试\\"引号\\"","value":42}`,
    (r) => r.name === '测试"引号"' && r.value === 42, // JS 源码 \\" → JSON 字面值 \" → 解码后 "
  ],
  [
    'G3 含未闭合字符串但有部分已闭',
    `{"meta":{"name":"完整名","desc":"未完`,
    (r) => r.meta.name === '完整名' && r.meta.desc === '未完',
  ],
  [
    'H1 多层嵌套残缺',
    `{"meta":{"x":{"y":{"z":"hello","a":`,
    (r) => r.meta.x.y.z === 'hello' && r.meta.x.y.a === null,
  ],
  [
    'H2 真实场景：截断于 requirements 数组中间',
    `{"meta":{"name":"X"},"requirements":[{"id":"R1","section":"第1节","title":"需求1"},{"id":"R2","section":"第2节","title":"需求2`,
    (r) => r.meta.name === 'X' && r.requirements.length >= 2 && r.requirements[0].id === 'R1',
  ],
  [
    'H3 截断于 wbs 叶子节点工时',
    `{"wbs":[{"id":"WBS-1","children":[{"id":"WBS-1.1","name":"需求管理","hours":`,
    (r) => r.wbs[0].id === 'WBS-1' && r.wbs[0].children[0].id === 'WBS-1.1',
  ],
];

console.log('=== 修补器单元测试 ===\n');
for (const [name, input, check] of cases) {
  try {
    const r = tryRepairTruncatedJSON(input);
    if (r === null) {
      ok(name, false, '返回 null');
      console.log('   输入:', JSON.stringify(input).slice(0, 100));
    } else {
      const passCase = check(r);
      ok(name, passCase, passCase ? '' : `结果不符合期望: ${JSON.stringify(r).slice(0, 200)}`);
    }
  } catch (e) {
    ok(name, false, e.message);
  }
}

// extractJSON 集成测试
console.log('\n=== extractJSON 集成测试 ===\n');
const ex1 = extractJSON(`{"meta":{"a":1,"b":"hello","arr":[1,2,3]}}`);
ok('ex1 完整 JSON', ex1.meta.b === 'hello' && ex1.meta.arr.length === 3);

const ex2 = extractJSON(`\`\`\`json\n{"meta":{"a":1,"b":"未完\n\`\`\``);
ok('ex2 围栏+截断', ex2.meta.a === 1);

const ex3 = extractJSON(`{"a":1,"b":{"c":2,"d":`);
ok('ex3 嵌套截断', ex3.a === 1 && ex3.b.c === 2 && ex3.b.d === null);

try {
  extractJSON('这里没有任何 JSON');
  ok('ex4 非法输入应抛错', false, '未抛错');
} catch (e) {
  ok('ex4 非法输入应抛错', e.message.includes('无法解析'));
}

// =========== peelOnion 测试 ===========
ok(
  'I1 截断在 milestones 数组中：状态机能恢复 meta + wbs + 部分 milestones',
  tryRepairTruncatedJSON(`{
  "meta": { "projectName": "项目A", "durationWeeks": 26 },
  "lifecyclePhases": ["启动","规划"],
  "wbs": [{"id":"1","code":"1","name":"启动","estimatedHours":40,"children":[]}],
  "milestones": [
    { "id": "M1", "name": "项目启动", "phase": "启动阶段", "weekOffset": 1 }
   截断在这里，期望自动补 ] 和 }
`)
    ?.meta?.projectName === '项目A'
);

ok(
  'I2 完全嵌套闭合截断',
  tryRepairTruncatedJSON(`{"meta":{"a":1},"wbs":[{"x":1`)
    ?.meta?.a === 1
);

ok(
  'I3 截断在字符串值中（meta.name）',
  tryRepairTruncatedJSON(`{"meta":{"name":"资产托管业务`)
    ?.meta?.name === '资产托管业务'
);

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail === 0 ? 0 : 1);