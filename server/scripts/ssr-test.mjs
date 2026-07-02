// 用 React SSR 实际渲染 WBSTree 看输出 HTML
import React from 'react';
import { renderToString } from 'react-dom/server';
import WBSTree from '../client/src/components/WBSTree.jsx';

// 模拟真实后端返回的数据（含 L1-L4）
const wbs = {
  meta: { projectName: '测试项目', durationWeeks: 18 },
  lifecyclePhases: ['启动阶段', '规划阶段', '迭代执行', '收尾'],
  wbs: [
    {
      id: 'WBS-1',
      code: '1',
      name: '启动阶段',
      level: 1,
      estimatedHours: 40,
      children: [
        {
          id: 'WBS-1.1',
          code: '1.1',
          name: '项目启动会',
          level: 2,
          estimatedHours: 16,
          children: [
            {
              id: 'WBS-1.1.1',
              code: '1.1.1',
              name: '启动会议纪要',
              level: 3,
              estimatedHours: 8,
              deliverable: '会议纪要',
              children: [],
            },
            {
              id: 'WBS-1.1.2',
              code: '1.1.2',
              name: '项目章程',
              level: 3,
              estimatedHours: 8,
              deliverable: '项目章程',
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'WBS-2',
      code: '2',
      name: '规划阶段',
      level: 1,
      estimatedHours: 80,
      children: [],
    },
  ],
};

const html = renderToString(React.createElement(WBSTree, { wbs }));
console.log('=== 渲染 HTML（节选）===');
console.log(html.substring(0, 3000));
console.log('\n=== 总长度 ===', html.length, 'chars');

// 统计各级节点出现次数
const matches = html.match(/L[1-5]/g) || [];
console.log('\n=== L 徽章出现次数 ===');
const counts = {};
matches.forEach((m) => counts[m] = (counts[m] || 0) + 1);
Object.entries(counts).forEach(([k, v]) => console.log(`  ${k}: ${v} 次`));

// 检查是否包含子节点内容
const containsL2 = html.includes('项目启动会');
const containsL3 = html.includes('启动会议纪要');
const containsL4 = html.includes('项目章程');
console.log('\n=== 子节点内容检查 ===');
console.log(`L2 (项目启动会): ${containsL2 ? '✅ 出现' : '❌ 缺失'}`);
console.log(`L3 (启动会议纪要): ${containsL3 ? '✅ 出现' : '❌ 缺失'}`);
console.log(`L3 (项目章程): ${containsL4 ? '✅ 出现' : '❌ 缺失'}`);
