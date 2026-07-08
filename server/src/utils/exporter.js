// WBS 导出工具：xlsx / md / docx / json
// 统一读取 wbs.wbs[] + lifecyclePhases[]（v2.5 数据结构），与前端 WBSTree 完全一致
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
} from 'docx';

const OWNER_LABEL = {
  PM: '项目经理',
  BA: '业务分析师',
  AR: 'AI/算法工程师',
  SR: '系统架构师',
  SA: '架构师',
  TL: '研发负责人',
  DEV: '后端开发',
  Dev: '开发工程师',
  QA: '测试/QA',
  OPS: '运维',
  Ops: '运维',
  DATA: '数据工程师',
  Data: '数据工程',
};

/**
 * 统一从 wbs 树中收集所有扁平行
 * 输入: wbs = { meta, lifecyclePhases, wbs:[{id,code,name,level,...}], milestones, requirements, rtm }
 * 输出: [{ code, level, name, owner, hours, deliverable, sowEvidence, nameType, parentCode, phase }]
 */
function flattenWbs(wbs) {
  const rows = [];
  function walk(node, parentCode = '', phase = '') {
    if (!node || typeof node !== 'object') return;
    const row = {
      code: node.code || node.id || '',
      level: node.level || 0,
      name: node.name || '',
      owner: node.owner || '',
      hours: node.estimatedHours ?? node.hours ?? node.effortHours ?? '',
      deliverable: node.deliverable || '',
      sowEvidence: node.sowEvidence || '',
      nameType: node.nameType || '',
      parentCode,
      phase,
    };
    rows.push(row);
    // 子节点继承当前 phase：L1 为 phase；L2+ 继承最近 L1 的 phase
    const childPhase = node.level === 1 ? node.name : phase;
    (node.children || []).forEach((c) => walk(c, row.code, childPhase));
  }
  (wbs.wbs || []).forEach((n) => walk(n, '', n.name));
  return rows;
}

// 1. Excel 导出
export async function exportXlsx(wbs) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SOW→WBS System';
  wb.created = new Date();

  // Sheet 1: WBS 总览（扁平树）
  const sheet1 = wb.addWorksheet('WBS');
  sheet1.columns = [
    { header: 'WBS Code', key: 'code', width: 14 },
    { header: '层级', key: 'level', width: 8 },
    { header: '名称', key: 'name', width: 40 },
    { header: '责任方', key: 'owner', width: 14 },
    { header: '工时(h)', key: 'hours', width: 10 },
    { header: '交付物', key: 'deliverable', width: 40 },
    { header: 'SOW映射', key: 'sowRef', width: 30 },
    { header: '阶段', key: 'phase', width: 16 },
    { header: 'nameType', key: 'nameType', width: 12 },
  ];
  const headerRow = sheet1.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0EFFF' },
  };

  const rows = flattenWbs(wbs);
  rows.forEach((r) => {
    const sheetRow = sheet1.addRow({
      code: r.code,
      level: `L${r.level}`,
      name: r.name,
      owner: r.owner ? `${r.owner} (${OWNER_LABEL[r.owner] || r.owner})` : '',
      hours: r.hours,
      deliverable: r.deliverable,
      sowRef: r.sowEvidence,
      phase: r.phase,
      nameType: r.nameType,
    });
    // 缩进：层级越深前面空格越多
    const indent = '  '.repeat(Math.max(0, r.level - 1));
    if (r.level > 1) {
      sheetRow.getCell('name').value = `${indent}${r.name}`;
    }
    // 顶层 L1 加粗染色
    if (r.level === 1) {
      sheetRow.font = { bold: true };
      sheetRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEF6FF' },
      };
    } else if (r.level === 2) {
      sheetRow.font = { bold: true };
      sheetRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8FAFC' },
      };
    } else if (r.level === 3) {
      sheetRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFBEB' },
      };
    }
    // 启用 Excel 分组大纲（可折叠层级）：L1 留 0 级，L2 → 1 级，L3 → 2 级...
    // 仅对非 L1 行设置大纲级别，且要忽略子节点都为叶子的情况
    if (r.level >= 1) {
      sheetRow.outlineLevel = Math.max(0, r.level - 1);
    }
  });
  // 大纲设置：摘要行在下方，启用折叠按钮
  sheet1.properties.outlineProperties = {
    summaryBelow: true,
    summaryRight: true,
  };
  sheet1.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet 2: 项目 Meta
  const meta = wbs.meta || {};
  const sheet2 = wb.addWorksheet('Meta');
  sheet2.columns = [
    { header: '字段', key: 'k', width: 24 },
    { header: '值', key: 'v', width: 80 },
  ];
  Object.entries(meta).forEach(([k, v]) => {
    sheet2.addRow({
      k,
      v: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? ''),
    });
  });

  // Sheet 3: 风险
  if (Array.isArray(wbs.risks) && wbs.risks.length) {
    const sheet3 = wb.addWorksheet('风险');
    sheet3.columns = [
      { header: 'ID', key: 'id', width: 6 },
      { header: '类别', key: 'category', width: 10 },
      { header: '等级', key: 'level', width: 10 },
      { header: 'P', key: 'p', width: 6 },
      { header: 'I', key: 'i', width: 6 },
      { header: '描述', key: 'desc', width: 40 },
      { header: '证据', key: 'evidence', width: 40 },
      { header: '缓释建议', key: 'mitigation', width: 40 },
    ];
    wbs.risks.forEach((r, i) =>
      sheet3.addRow({
        id: i + 1,
        category: r.category,
        level: r.level,
        p: r.p,
        i: r.i,
        desc: r.description,
        evidence: r.evidence,
        mitigation: r.mitigation,
      }),
    );
  }

  // Sheet 4: 里程碑
  if (Array.isArray(wbs.milestones) && wbs.milestones.length) {
    const sheet4 = wb.addWorksheet('里程碑');
    sheet4.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: '阶段', key: 'phase', width: 16 },
      { header: '里程碑', key: 'name', width: 32 },
      { header: '周次', key: 'weekOffset', width: 8 },
      { header: '交付物', key: 'deliverable', width: 32 },
    ];
    wbs.milestones.forEach((m) =>
      sheet4.addRow({
        id: m.id || m.code,
        phase: m.phase,
        name: m.name,
        weekOffset: m.weekOffset,
        deliverable: m.deliverable,
      }),
    );
  }

  // Sheet 5: 需求 + RTM（需求追溯矩阵）
  if (Array.isArray(wbs.rtm) && wbs.rtm.length) {
    const sheet5 = wb.addWorksheet('RTM');
    sheet5.columns = [
      { header: '需求ID', key: 'rid', width: 10 },
      { header: 'WBS ID', key: 'wid', width: 14 },
    ];
    wbs.rtm.forEach((r) => {
      sheet5.addRow({ rid: r.requirementId, wid: r.wbsId });
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

// 2. Markdown 导出
export function exportMarkdown(wbs) {
  const meta = wbs.meta || {};
  const phases = wbs.lifecyclePhases || [];
  const rows = flattenWbs(wbs);
  const lines = [];

  // 标题与 meta
  lines.push(`# ${meta.projectName || meta.project || 'SOW WBS 工作分解结构'}`);
  if (meta.projectCode) lines.push(`> 项目编号：**${meta.projectCode}**`);
  if (meta.client) lines.push(`> 客户：${meta.client}`);
  if (meta.industry) lines.push(`> 行业：${meta.industry}`);
  if (meta.projectType) lines.push(`> 项目类型：${meta.projectType}`);
  if (meta.durationWeeks) lines.push(`> 总工期：${meta.durationWeeks} 周（约 ${meta.durationMonths ?? Math.round(meta.durationWeeks / 4.33)} 月）`);
  if (meta.teamSize) lines.push(`> 团队规模：${meta.teamSize} 人`);
  if (meta.startDate) lines.push(`> 计划启动：${meta.startDate}`);
  if (meta.summary) lines.push(`\n> ${meta.summary}`);
  lines.push('');

  // 行业识别证据
  if (Array.isArray(meta.industryEvidence) && meta.industryEvidence.length) {
    lines.push('## 行业识别证据');
    meta.industryEvidence.forEach((e, i) => lines.push(`${i + 1}. ${e}`));
    lines.push('');
  }

  // 生命周期阶段总览
  if (phases.length > 0) {
    lines.push('## 生命周期阶段');
    phases.forEach((p, i) => {
      const phaseRows = rows.filter((r) => r.phase === p);
      const phaseHours = phaseRows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
      lines.push(`${i + 1}. **${p}** — ${phaseRows.length} 节点 / ${phaseHours}h`);
    });
    lines.push('');
  }

  // WBS 完整树（按阶段分章节）
  lines.push('## WBS 工作分解结构');
  if (phases.length > 0) {
    // 按阶段拆分：每个阶段一节
    phases.forEach((phase) => {
      lines.push(`### ${phase}`);
      lines.push('');
      lines.push('| WBS Code | 层级 | 名称 | 责任方 | 工时(h) | 交付物 | SOW映射 |');
      lines.push('|---|---|---|---|---:|---|---|');
      rows
        .filter((r) => r.phase === phase)
        .forEach((r) => {
          const indent = '　'.repeat(Math.max(0, r.level - 1));
          lines.push(
            `| ${r.code} | L${r.level} | ${indent}${r.name} | ${r.owner || ''} | ${r.hours || ''} | ${r.deliverable || ''} | ${r.sowEvidence || ''} |`,
          );
        });
      lines.push('');
    });
  } else {
    // 无阶段信息：整树扁平
    lines.push('| WBS Code | 层级 | 名称 | 责任方 | 工时(h) | 交付物 | SOW映射 |');
    lines.push('|---|---|---|---|---:|---|---|');
    rows.forEach((r) => {
      const indent = '　'.repeat(Math.max(0, r.level - 1));
      lines.push(
        `| ${r.code} | L${r.level} | ${indent}${r.name} | ${r.owner || ''} | ${r.hours || ''} | ${r.deliverable || ''} | ${r.sowEvidence || ''} |`,
      );
    });
    lines.push('');
  }

  // 工作包清单（仅 L3）
  const workPackages = rows.filter((r) => r.level === 3);
  if (workPackages.length > 0) {
    lines.push('## 工作包清单（仅 L3）');
    lines.push(`共 **${workPackages.length}** 个工作包，总工时 **${workPackages.reduce((s, r) => s + (Number(r.hours) || 0), 0)}h**`);
    lines.push('');
    lines.push('| WBS Code | 阶段 | 工作包名称 | 责任方 | 工时(h) | 交付物 |');
    lines.push('|---|---|---|---|---:|---|');
    workPackages.forEach((r) => {
      lines.push(
        `| ${r.code} | ${r.phase} | ${r.name} | ${r.owner || ''} | ${r.hours || ''} | ${r.deliverable || ''} |`,
      );
    });
    lines.push('');
  }

  // 里程碑
  if (Array.isArray(wbs.milestones) && wbs.milestones.length) {
    lines.push('## 关键里程碑');
    lines.push('| ID | 阶段 | 里程碑 | 周次 | 交付物 |');
    lines.push('|---|---|---|---:|---|');
    wbs.milestones.forEach((m) => {
      lines.push(
        `| ${m.id || m.code || ''} | ${m.phase || ''} | ${m.name || ''} | ${m.weekOffset ?? ''} | ${m.deliverable || ''} |`,
      );
    });
    lines.push('');
  }

  // 风险
  if (Array.isArray(wbs.risks) && wbs.risks.length) {
    lines.push('## 风险列表');
    lines.push('| # | 类别 | 等级 | P | I | 描述 | 缓释 |');
    lines.push('|---|---|---|---|---|---|---|');
    wbs.risks.forEach((r, i) =>
      lines.push(
        `| ${i + 1} | ${r.category || ''} | ${r.level || ''} | ${r.p ?? ''} | ${r.i ?? ''} | ${r.description || ''} | ${r.mitigation || ''} |`,
      ),
    );
    lines.push('');
  }

  // 待澄清
  if (Array.isArray(wbs.clarifications) && wbs.clarifications.length) {
    lines.push('## 待澄清项');
    wbs.clarifications.forEach((c, i) =>
      lines.push(`${i + 1}. ${typeof c === 'string' ? c : JSON.stringify(c)}`),
    );
  }

  return lines.join('\n');
}

// 3. Word 导出
export async function exportDocx(wbs) {
  const children = [];
  const meta = wbs.meta || {};
  const phases = wbs.lifecyclePhases || [];
  const rows = flattenWbs(wbs);

  // 标题
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({ text: meta.projectName || meta.project || 'SOW WBS 工作分解结构', bold: true }),
      ],
    }),
  );

  // Meta 信息
  const metaLines = [];
  if (meta.projectCode) metaLines.push(`项目编号：${meta.projectCode}`);
  if (meta.client) metaLines.push(`客户：${meta.client}`);
  if (meta.industry) metaLines.push(`行业：${meta.industry}`);
  if (meta.projectType) metaLines.push(`项目类型：${meta.projectType}`);
  if (meta.durationWeeks) metaLines.push(`总工期：${meta.durationWeeks} 周（约 ${meta.durationMonths ?? Math.round(meta.durationWeeks / 4.33)} 月）`);
  if (meta.teamSize) metaLines.push(`团队规模：${meta.teamSize} 人`);
  if (meta.startDate) metaLines.push(`计划启动：${meta.startDate}`);
  metaLines.forEach((t) => children.push(new Paragraph({ children: [new TextRun({ text: t })] })));
  if (meta.summary) {
    children.push(new Paragraph({ children: [new TextRun({ text: meta.summary, italics: true })] }));
  }

  // 生命周期阶段总览
  if (phases.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '生命周期阶段' })],
      }),
    );
    phases.forEach((p, i) => {
      const phaseRows = rows.filter((r) => r.phase === p);
      const phaseHours = phaseRows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${i + 1}. ${p} — ${phaseRows.length} 节点 / ${phaseHours}h` })],
        }),
      );
    });
  }

  // WBS 主树（按阶段分组）
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: 'WBS 工作分解结构' })],
    }),
  );

  const buildTable = (sectionRows) => {
    const tableRows = [
      new TableRow({
        children: ['WBS Code', '层级', '名称', '责任方', '工时(h)', '交付物', 'SOW映射'].map(
          (t) =>
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: t, bold: true })] }),
              ],
            }),
        ),
      }),
    ];
    sectionRows.forEach((r) => {
      const indent = '　'.repeat(Math.max(0, r.level - 1));
      const isBold = r.level === 1 || r.level === 2;
      const cellPara = (text) =>
        new Paragraph({ children: [new TextRun({ text: String(text), bold: isBold })] });
      tableRows.push(
        new TableRow({
          children: [
            cellPara(r.code),
            cellPara(`L${r.level}`),
            cellPara(`${indent}${r.name}`),
            cellPara(r.owner ? `${r.owner} (${OWNER_LABEL[r.owner] || r.owner})` : ''),
            cellPara(r.hours),
            cellPara(r.deliverable || ''),
            cellPara(r.sowEvidence || ''),
          ],
        }),
      );
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    });
  };

  const groups = phases.length > 0 ? phases : ['__ALL__'];
  groups.forEach((phase) => {
    if (phase === '__ALL__') {
      // 无阶段信息：单表全量
      children.push(buildTable(rows));
    } else {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: phase })],
        }),
      );
      children.push(buildTable(rows.filter((r) => r.phase === phase)));
    }
  });

  // 工作包清单（仅 L3）
  const workPackages = rows.filter((r) => r.level === 3);
  if (workPackages.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '工作包清单（仅 L3）' })],
      }),
    );
    const wpHours = workPackages.reduce((s, r) => s + (Number(r.hours) || 0), 0);
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `共 ${workPackages.length} 个工作包，总工时 ${wpHours}h`, bold: true }),
        ],
      }),
    );

    const wpTableRows = [
      new TableRow({
        children: ['WBS Code', '阶段', '工作包名称', '责任方', '工时(h)', '交付物'].map(
          (t) =>
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: t, bold: true })] }),
              ],
            }),
        ),
      }),
    ];
    workPackages.forEach((r) => {
      wpTableRows.push(
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.code })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.phase })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.name })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.owner || '' })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(r.hours || '') })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: r.deliverable || '' })] })] }),
          ],
        }),
      );
    });
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: wpTableRows,
      }),
    );
  }

  // 里程碑
  if (Array.isArray(wbs.milestones) && wbs.milestones.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '关键里程碑' })],
      }),
    );
    wbs.milestones.forEach((m) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${m.id || m.code || ''} · ${m.name || ''}（${m.phase || ''} · W${m.weekOffset ?? '?'}）`,
              bold: true,
            }),
          ],
        }),
      );
      if (m.deliverable) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `交付物：${m.deliverable}` })],
          }),
        );
      }
    });
  }

  // 风险
  if (Array.isArray(wbs.risks) && wbs.risks.length) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: '风险列表' })],
      }),
    );
    wbs.risks.forEach((r, i) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${i + 1}. [${r.level || ''}] ${r.description || ''}`,
              bold: true,
            }),
          ],
        }),
      );
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `类别：${r.category || ''} | P=${r.p ?? ''} | I=${r.i ?? ''}`,
            }),
          ],
        }),
      );
      if (r.evidence) {
        children.push(new Paragraph({ children: [new TextRun({ text: `证据：${r.evidence}` })] }));
      }
      if (r.mitigation) {
        children.push(new Paragraph({ children: [new TextRun({ text: `缓释：${r.mitigation}` })] }));
      }
    });
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return await Packer.toBuffer(doc);
}
