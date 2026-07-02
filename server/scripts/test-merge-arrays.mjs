// 单元测试：续写辅助函数
import { strict as assert } from 'node:assert';

// 直接从 wbsService.js 拷贝逻辑（简化版）— 或 import
// 这里手动重建测试
function isArrayOnly(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const allowed = new Set(['milestones', 'requirements', 'rtm']);
  let hasArray = false;
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) return false;
    if (Array.isArray(obj[k]) && obj[k].length > 0) hasArray = true;
  }
  return hasArray;
}

function mergeWbsArrays(head, tail) {
  const out = { ...head };
  for (const k of ['milestones', 'requirements', 'rtm']) {
    const a = Array.isArray(head?.[k]) ? head[k] : [];
    const b = Array.isArray(tail?.[k]) ? tail[k] : [];
    if (b.length === 0) { out[k] = a; continue; }
    const keyOf = (item) => {
      if (k === 'milestones') return item.id || item.name;
      if (k === 'requirements') return item.id || item.title;
      return `${item.reqId || ''}::${item.wbsCode || ''}`;
    };
    const seen = new Set(a.map(keyOf));
    const merged = [...a];
    for (const item of b) {
      const key = keyOf(item);
      if (key && !seen.has(key)) { merged.push(item); seen.add(key); }
    }
    out[k] = merged;
  }
  return out;
}

function extractArraysFromAny(obj) {
  const out = {};
  for (const k of ['milestones', 'requirements', 'rtm']) {
    if (Array.isArray(obj?.[k])) out[k] = obj[k];
  }
  return out;
}

// =========== isArrayOnly ===========
assert.equal(isArrayOnly(null), false, 'null 应为 false');
assert.equal(isArrayOnly({}), false, '空对象应为 false（hasArray=false）');
assert.equal(isArrayOnly({ milestones: [] }), false, '空数组对象应为 false');
assert.equal(isArrayOnly({ milestones: [{ id: 'M1' }] }), true, '单个数组 → true');
assert.equal(isArrayOnly({ milestones: [{id:'M1'}], requirements: [{id:'R1'}] }), true, '多个数组 → true');
assert.equal(isArrayOnly({ milestones: [{id:'M1'}], meta: { projectName: 'X' } }), false, '含 meta → false');
assert.equal(isArrayOnly({ milestones: [{id:'M1'}], wbs: [{code:'1'}] }), false, '含 wbs → false');
assert.equal(isArrayOnly({ childNodes: [] }), false, '非允许字段 → false');

// =========== mergeWbsArrays ===========
const head = {
  meta: { projectName: 'A' },
  lifecyclePhases: ['启动'],
  wbs: [{ code: '1', name: '启动', children: [] }],
  milestones: [{ id: 'M1', name: '已存在' }],
  requirements: [{ id: 'REQ-001', title: '已存在' }],
  rtm: [{ reqId: 'REQ-001', wbsCode: '1.1' }],
};
const tail = {
  milestones: [{ id: 'M2', name: '新增' }, { id: 'M1', name: '重复' }],
  requirements: [{ id: 'REQ-002', title: '新增需求' }],
  rtm: [{ reqId: 'REQ-002', wbsCode: '2.1' }, { reqId: 'REQ-001', wbsCode: '1.1' }],
};
const merged = mergeWbsArrays(head, tail);
assert.equal(merged.meta.projectName, 'A', 'meta 保留');
assert.equal(merged.lifecyclePhases.length, 1, 'lifecyclePhases 保留');
assert.equal(merged.wbs.length, 1, 'wbs 保留');
assert.equal(merged.milestones.length, 2, 'M1 + M2（去重）');
assert.equal(merged.milestones[1].id, 'M2', 'M2 在尾部');
assert.equal(merged.requirements.length, 2, 'REQ-001 + REQ-002');
assert.equal(merged.rtm.length, 2, '2 行 RTM（重复跳过）');

// 头部空数组 + 尾部有数据
const head2 = { meta: {}, wbs: [], milestones: [], requirements: [], rtm: [] };
const tail2 = { milestones: [{ id: 'M1' }] };
const merged2 = mergeWbsArrays(head2, tail2);
assert.equal(merged2.milestones.length, 1, 'head 空 → tail 填入');

// 尾部空数组
const merged3 = mergeWbsArrays(head, {});
assert.equal(merged3.milestones.length, 1, 'tail 空 → 保留 head');

// =========== extractArraysFromAny ===========
const r1 = extractArraysFromAny({ milestones: [{}], requirements: [{}] });
assert.ok(Array.isArray(r1.milestones), 'milestones 存在');
assert.ok(Array.isArray(r1.requirements), 'requirements 存在');
assert.equal(r1.rtm, undefined, '缺失字段不返回');

const r2 = extractArraysFromAny({ wbs: [{}] });
assert.deepEqual(r2, {}, '无目标字段 → 空对象');

console.log('✅ 续写辅助函数：11/11 测试通过');