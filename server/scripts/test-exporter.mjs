import { exportMarkdown, exportXlsx, exportDocx } from '../src/utils/exporter.js';

const sampleWbs = {
  meta: {
    projectCode: 'TEST-2024-DEMO',
    projectName: '客户流水分析智能体',
    projectType: 'Hybrid',
    client: '海门农商行',
    durationWeeks: 18,
    durationMonths: 4,
    startDate: '2024-09',
    teamSize: 8,
    summary: '建设客户流水分析智能体，提升客户经理工作效率。',
    industryEvidence: ['金融业务', '银行交易', '客户管理'],
  },
  lifecyclePhases: ['启动阶段', '需求阶段', '设计阶段', '实施阶段', '上线阶段'],
  wbs: [
    {
      id: 'WBS-1', code: '1', level: 1, name: '启动阶段', nameType: 'phase', estimatedHours: 64, children: [
        {
          id: 'WBS-1.1', code: '1.1', parentId: 'WBS-1', level: 2, name: '项目立项', nameType: 'process', estimatedHours: 32, children: [
            {
              id: 'WBS-1.1.1', code: '1.1.1', parentId: 'WBS-1.1', level: 3, name: '立项报告', nameType: 'deliverable', estimatedHours: 16, owner: 'PM', deliverable: '立项报告', sowEvidence: 'SOW 第1节', children: [
                { id: 'WBS-1.1.1.1', code: '1.1.1.1', level: 4, name: '可行性分析', nameType: 'deliverable', estimatedHours: 8, owner: 'BA', deliverable: '可行性报告', sowEvidence: '1.1' },
                { id: 'WBS-1.1.1.2', code: '1.1.1.2', level: 4, name: '预算编制', nameType: 'deliverable', estimatedHours: 8, owner: 'PM', deliverable: '预算表', sowEvidence: '1.1' },
              ],
            },
            {
              id: 'WBS-1.1.2', code: '1.1.2', parentId: 'WBS-1.1', level: 3, name: '章程发布', nameType: 'deliverable', estimatedHours: 16, owner: 'PM', deliverable: '项目章程', sowEvidence: '1.1',
              children: [],
            },
          ],
        },
        {
          id: 'WBS-1.2', code: '1.2', parentId: 'WBS-1', level: 2, name: '团队组建', nameType: 'process', estimatedHours: 32, children: [
            {
              id: 'WBS-1.2.1', code: '1.2.1', parentId: 'WBS-1.2', level: 3, name: '角色定义', nameType: 'deliverable', estimatedHours: 16, owner: 'PM', deliverable: 'RACI矩阵', sowEvidence: '1.2',
              children: [],
            },
            {
              id: 'WBS-1.2.2', code: '1.2.2', parentId: 'WBS-1.2', level: 3, name: '人员招募', nameType: 'deliverable', estimatedHours: 16, owner: 'PM', deliverable: '团队名册', sowEvidence: '1.2',
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'WBS-2', code: '2', level: 1, name: '需求阶段', nameType: 'phase', estimatedHours: 80, children: [
        {
          id: 'WBS-2.1', code: '2.1', parentId: 'WBS-2', level: 2, name: '业务调研', nameType: 'process', estimatedHours: 40, children: [
            {
              id: 'WBS-2.1.1', code: '2.1.1', parentId: 'WBS-2.1', level: 3, name: '客户访谈', nameType: 'deliverable', estimatedHours: 24, owner: 'BA', deliverable: '访谈纪要', sowEvidence: '3.2',
              children: [],
            },
            {
              id: 'WBS-2.1.2', code: '2.1.2', parentId: 'WBS-2.1', level: 3, name: '场景梳理', nameType: 'deliverable', estimatedHours: 16, owner: 'BA', deliverable: '场景清单', sowEvidence: '3.2',
              children: [],
            },
          ],
        },
      ],
    },
  ],
  milestones: [
    { id: 'M1', phase: '启动阶段', name: '立项评审', weekOffset: 1, deliverable: '立项报告 V1.0' },
    { id: 'M2', phase: '需求阶段', name: '需求基线', weekOffset: 4, deliverable: '需求规格 V1.0' },
  ],
  risks: [
    { category: '技术', level: 'HIGH', p: 3, i: 4, description: 'PS篡改检测算法精度不足', evidence: '3.4', mitigation: '采用多模型集成' },
    { category: '业务', level: 'MEDIUM', p: 2, i: 3, description: '客户业务理解偏差', evidence: '3.2', mitigation: '建立业务专家评审机制' },
  ],
  rtm: [
    { requirementId: 'R1', wbsId: 'WBS-2.1.1' },
    { requirementId: 'R2', wbsId: 'WBS-2.1.2' },
  ],
};

const md = exportMarkdown(sampleWbs);
console.log('=== Markdown 总长度 ===', md.length);
console.log('\n=== Markdown 前 60 行 ===');
console.log(md.split('\n').slice(0, 60).join('\n'));

console.log('\n=== 工作包清单段 ===');
const wpIdx = md.indexOf('## 工作包清单');
if (wpIdx >= 0) console.log(md.substring(wpIdx, wpIdx + 400));

const xlsxBuf = await exportXlsx(sampleWbs);
console.log('\n=== XLSX Buffer ===');
console.log('bytes:', xlsxBuf.byteLength, 'type:', typeof xlsxBuf, 'isBuffer:', Buffer.isBuffer(xlsxBuf));

const docxBuf = await exportDocx(sampleWbs);
console.log('\n=== DOCX Buffer ===');
console.log('bytes:', docxBuf.byteLength, 'type:', typeof docxBuf, 'isBuffer:', Buffer.isBuffer(docxBuf));

console.log('\n✅ 全部导出调用成功');
