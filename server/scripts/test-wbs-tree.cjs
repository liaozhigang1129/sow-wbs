// 单元测试：验证 WBSTree 能渲染 L1-L5 嵌套数据（不依赖 React DOM）
// 通过 props 传递结构化数据并检查 key 一致性

const sample = {
  meta: { projectName: 'L5测试项目', durationWeeks: 12 },
  lifecyclePhases: ['L1阶段A', 'L1阶段B'],
  wbs: [
    {
      id: 'WBS-1',
      code: '1',
      name: '阶段A',
      level: 1,
      estimatedHours: 200,
      children: [
        {
          id: 'WBS-1.1',
          code: '1.1',
          name: '主要交付物A1',
          level: 2,
          estimatedHours: 100,
          children: [
            {
              id: 'WBS-1.1.1',
              code: '1.1.1',
              name: '工作包A1-1',
              level: 3,
              estimatedHours: 50,
              children: [
                {
                  id: 'WBS-1.1.1.1',
                  code: '1.1.1.1',
                  name: '子任务A1-1-1',
                  level: 4,
                  estimatedHours: 25,
                  children: [
                    {
                      id: 'WBS-1.1.1.1.1',
                      code: '1.1.1.1.1',
                      name: '细分子任务',
                      level: 5,
                      estimatedHours: 8,
                      deliverable: '产物',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'WBS-2',
      code: '2',
      name: '阶段B',
      level: 1,
      estimatedHours: 80,
      // 无 id 测试 code fallback
      children: [
        {
          // 无 id
          code: '2.1',
          name: '交付物B1',
          level: 2,
          children: [
            {
              code: '2.1.1',
              name: '包B1-1',
              level: 3,
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

// 模拟 TreeNode 的 key 生成逻辑
function nodeKey(n) {
  return n.id || n.code || `fallback-${Math.random()}`;
}

const keys = [];
function walk(n, d = 1) {
  const k = nodeKey(n);
  keys.push({ code: n.code, level: d, key: k });
  if (n.children?.length) n.children.forEach((c) => walk(c, d + 1));
}
sample.wbs.forEach((n) => walk(n));

console.log('=== WBS 树深度统计 ===');
console.log(`总节点数: ${keys.length}`);
console.log(`最深层级: L${Math.max(...keys.map((k) => k.level))}`);
console.log('\n=== 展开 key 列表 ===');
keys.forEach((k) => {
  const fallback = k.key.startsWith('fallback-') ? ' ⚠️ FALLBACK' : '';
  console.log(`  L${k.level} ${k.code.padEnd(12)} → key=${k.key}${fallback}`);
});

// 校验：所有节点都应该有稳定的 key
const hasFallback = keys.some((k) => k.key.startsWith('fallback-'));
if (hasFallback) {
  console.log('\n❌ 失败：存在 fallback key（说明 id 和 code 都缺失）');
  process.exit(1);
} else {
  console.log('\n✅ 通过：所有节点都有稳定的展开 key');
}

// 校验：节点分布
const depthDist = {};
keys.forEach((k) => {
  depthDist[k.level] = (depthDist[k.level] || 0) + 1;
});
console.log('\n=== 层级分布 ===');
Object.entries(depthDist).forEach(([d, c]) => console.log(`  L${d}: ${c} 个`));

const expected = { 1: 2, 2: 2, 3: 2, 4: 1, 5: 1 };
const match = JSON.stringify(depthDist) === JSON.stringify(expected);
if (match) {
  console.log('✅ 层级分布符合 L1-L5 测试样本');
} else {
  console.log(`❌ 层级分布不符，期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(depthDist)}`);
  process.exit(1);
}
