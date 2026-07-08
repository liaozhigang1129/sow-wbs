// /server/src/services/mockService.js
// ⭐ v2.17：基于 SOW 内容自适应的 mock WBS 生成器
//
// 用途：当用户未配置 API Key（或 API Key 无效）时，自动降级到本生成器
//       保证"上传 SOW → 一键生成 WBS → 校验 → 导出"完整流程可跑通
//
// 设计原则：
//   1. 结构合法：生成的 WBS 必须通过 validateWBS 校验（errors=0）
//   2. 内容相关：根据 SOW 关键词推断主题，生成对应行业的 L3/L4/L5
//   3. 工时守恒：每层 hours = Σ(children.hours)，避免 validate 报"漂移"
//   4. 命名规范：节点名必须含交付物/过程/阶段名词，禁止"实施"等动词
//   5. 零依赖：纯字符串处理，不调用任何 LLM

import { validateWBS } from '../utils/validator.js';

// ⭐ 交付物后缀白名单（来自 validator）
const SUFFIXES = [
  '报告', '文档', '服务', '脚本', '模型', '工具', '引擎',
  '纪���', '方案', '规范', '模板', '手册', '套件', '平台',
  '索引', '台账', '评估', '策略', '规则集', '适配器',
  '解析器', '检测器', '识别器', '生成器', '工作台',
  '清单', '数据集', '评测集', '看板', '配置', '台', '中心',
];
const STAGE_TERMS = ['评审', '基线', '签字', '定义', '规划', '选型', '测试', '演示', '部署', '上线', '验收', '移交', '评估', '决策', '管理'];

// ⭐ 关键词 → 行业主题 + 默认 L3 工作包名（每个 L3 名都符合命名规范）
const KEYWORD_PATTERNS = [
  {
    regex: /智能体|大模型|LLM|GPT|问答|RAG|知识库/,
    theme: '智能体',
    l3Names: ['Prompt 工程方案', '知识库构建服务', 'RAG 检索引擎', '对话引擎服务', '评测集建设清单', '幻觉检测报告'],
  },
  {
    regex: /银行|金融|信贷|风控|反欺诈|支付/,
    theme: '金融风控',
    l3Names: ['业务调研报告', '规则引擎服务', '风控模型服务', '决策引擎配置', '合规审查清单', '审计追溯报告'],
  },
  {
    regex: /OCR|识别|图像|视觉|检测|分割/,
    theme: '视觉AI',
    l3Names: ['图像采集方案', '数据标注平台', 'OCR 引擎服务', '版面分析报告', '模型评测集', '置信度评估报告'],
  },
  {
    regex: /微服务|Spring Cloud|Dubbo|K8s|Kubernetes/,
    theme: '云原生',
    l3Names: ['服务拆分方案', '注册中心配置', '配置中心部署', '服务网关服务', '链路追踪平台', 'K8s 编排脚本'],
  },
  {
    regex: /数据中台|数据治理|数据湖|数仓|ETL/,
    theme: '数据治理',
    l3Names: ['数据建模方案', '元数据管理平台', '数据质量评估', 'ETL 流水线脚本', '数据血缘索引', '主数据台账'],
  },
  {
    regex: /前端|Vue|React|移动端|小程序|H5/,
    theme: '前端开发',
    l3Names: ['UI 设计规范', '组件库平台', '页面集成文档', '交互联调报告', '性能优化方案', '兼容性测试报告'],
  },
  {
    regex: /测试|自动化|压测|性能/,
    theme: '测试',
    l3Names: ['测试用例设计', '自动化脚本', '性能压测报告', '安全扫描报告', '回归测试报告'],
  },
];

// ⭐ 6 阶段 PMBOK 模板
// ⭐ phase name 必须符合命名规范（不能含 '开发'/'实施'/'完成' 等 FORBIDDEN_VERBS）
// 注意 STAGE_TERMS 含 '管理'/'测试'/'部署'/'上线'/'验收'/'移交'
const PHASES = [
  { code: '1', name: '启动与立项管理' },
  { code: '2', name: '需求与方案规划' },
  { code: '3', name: '设计与构建管理' },
  { code: '4', name: '测试与质量保障' },
  { code: '5', name: '部署与上线服务' },
  { code: '6', name: '项目收尾与移交管理' },
];

const PHASE_WEIGHTS = [0.08, 0.18, 0.42, 0.16, 0.10, 0.06];

function detectTheme(sowText) {
  for (const pat of KEYWORD_PATTERNS) {
    if (pat.regex.test(sowText)) return pat;
  }
  return {
    theme: '通用软件',
    l3Names: ['需求分析文档', '概要设计方案', '详细设计规范', '编码实现服务', '单元测试报告', '集成测试报告'],
  };
}

function estimateTotalHours(sowText) {
  const base = Math.round(sowText.length * 0.6);
  return Math.max(800, Math.min(12000, base));
}

/**
 * 检查 name 是否符合命名规范
 */
function isValidName(name) {
  if (SUFFIXES.some((s) => name.endsWith(s))) return true;
  if (STAGE_TERMS.some((t) => name.includes(t))) return true;
  return false;
}

/**
 * 把不规范的 name 强制改成规范的（替换为合法后缀）
 */
function fixName(name) {
  if (isValidName(name)) return name;
  let fixed = name;
  // 移除禁用的动词后缀
  fixed = fixed.replace(/实施包?$/, '');
  fixed = fixed.replace(/实施$/, '');
  fixed = fixed.replace(/开发$/, '');
  fixed = fixed.replace(/搭建$/, '');
  fixed = fixed.replace(/建设$/, '');
  fixed = fixed.replace(/编写$/, '');
  fixed = fixed.replace(/完成$/, '');
  // 如果已经合法就直接返回
  if (isValidName(fixed)) return fixed;
  // 否则追加一个合法后缀（按优先级尝试）
  for (const suffix of ['方案', '报告', '文档', '服务', '平台', '工具', '清单', '台账', '管理']) {
    const candidate = fixed + suffix;
    if (isValidName(candidate)) return candidate;
  }
  return fixed + '方案';
}

function buildL5(parentName, hoursPerLeaf) {
  // ⭐ L5 名字直接是"评审/设计/实现/测试/验证"等动作，但包含名词（如"方案评审"含"方案"）
  // ⭐ tpl.name 必须符合命名规范（必须含 suffix 或 stage term）
  const tpls = [
    { name: '方案评审纪要',  deliverable: '评审纪要', owner: 'AR',  ratio: 0.20 },
    { name: '设计评审纪要',  deliverable: '评审纪要', owner: 'AR',  ratio: 0.15 },
    { name: '编码实现模块',  deliverable: '代码包',   owner: 'DEV', ratio: 0.35 },
    { name: '单元测试报告',  deliverable: '测试报告', owner: 'QA',  ratio: 0.15 },
    { name: '集成测试报告',  deliverable: '测试报告', owner: 'QA',  ratio: 0.15 },
  ];
  return tpls.map((tpl, i) => {
    const h = Math.max(4, Math.round(hoursPerLeaf * tpl.ratio));
    return {
      code: `L5-${i + 1}`,
      name: `${parentName}-${tpl.name}`,
      level: 5,
      estimatedHours: h,
      deliverable: tpl.deliverable,
      owner: tpl.owner,
      sowEvidence: `SOW 第 ${i + 1} 节相关需求`,
      children: [],
    };
  });
}

function buildL4(l4Code, parentName, totalHours) {
  const leaves = buildL5(parentName, totalHours / 5);
  const sum = leaves.reduce((s, n) => s + n.estimatedHours, 0);
  // ⭐ L4 名字直接用 parentName（已经合法），不再追加"实施包"
  return {
    id: l4Code,
    code: l4Code,
    name: parentName, // L3 名字已经合法（如"Prompt 工程方案"），L4 直接复用
    level: 4,
    estimatedHours: sum,
    children: leaves,
  };
}

function buildL3(l3Code, l3Name, phaseHours, l3Count) {
  const l3Hours = phaseHours / l3Count;
  const l4 = buildL4(`${l3Code}.1`, l3Name, l3Hours);
  return {
    id: l3Code,
    code: l3Code,
    name: fixName(l3Name),
    level: 3,
    estimatedHours: l4.estimatedHours,
    deliverable: `${fixName(l3Name)}交付物`,
    owner: 'DEV',
    sowEvidence: `SOW 涉及相关需求`,
    children: [l4],
  };
}

function buildL2(l2Code, l2Name, phaseHours, l3Names) {
  const l3Nodes = l3Names.map((name, i) => {
    const code = `${l2Code}.${i + 1}`;
    return buildL3(code, name, phaseHours, l3Names.length);
  });
  return {
    id: l2Code,
    code: l2Code,
    name: fixName(l2Name),
    level: 2,
    estimatedHours: l3Nodes.reduce((s, n) => s + n.estimatedHours, 0),
    children: l3Nodes,
  };
}

function extractProjectName(sowText) {
  const patterns = [
    /项目名称[：:]\s*([^\n\r]+)/,
    /项目背景[：:]\s*([^\n\r]+)/,
    /^#+\s*([^\n\r]{4,40})/m,
    /【([^】]+)】/,
  ];
  for (const pat of patterns) {
    const m = sowText.match(pat);
    if (m && m[1] && m[1].length >= 4 && m[1].length <= 60) {
      return m[1].trim();
    }
  }
  return null;
}

/**
 * ⭐ 自适应工时守恒修复
 * 遍历整个 WBS 树，确保每个 parent.hours = Σ(children.hours)
 */
function fixHourConsistency(wbs) {
  let changed = false;
  function walk(node) {
    if (!node.children?.length) return;
    node.children.forEach(walk);
    const sum = node.children.reduce((s, c) => s + (c.estimatedHours || 0), 0);
    // 保留差异超过 0.5h 的修正
    if (Math.abs((node.estimatedHours || 0) - sum) > 0.5) {
      node.estimatedHours = sum;
      changed = true;
    }
  }
  walk(wbs.wbs[0]); // L1
  return changed;
}

/**
 * ⭐ 修复命名
 */
function fixNames(wbs) {
  let changed = false;
  function walk(node) {
    if (!isValidName(node.name)) {
      node.name = fixName(node.name);
      changed = true;
    }
    node.children?.forEach(walk);
  }
  walk(wbs.wbs[0]);
  return changed;
}

/**
 * 主入口
 */
export function mockGenerateFromSOW(sowText, { promptMode = 'flexible', enableL4L5 = true } = {}) {
  const t0 = Date.now();
  const log = [];
  const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });

  push('info', 'start', '🧪 进入【Mock 自动生成】模式（无 API Key）', { sowChars: sowText.length, promptMode });
  push('info', 'input', 'SOW 已接收', { length: sowText.length });

  const { theme, l3Names: themeL3Names } = detectTheme(sowText);
  push('info', 'analyze', `🔍 推断项目主题：${theme}`, { theme });

  const totalHours = estimateTotalHours(sowText);
  push('info', 'estimate', `📊 估算总工时：${totalHours}h（基于 ${sowText.length} 字符）`);

  // 每阶段 4 个 L3
  const l3PerPhase = 4;
  const l2Children = PHASES.map((phase, idx) => {
    const phaseHours = Math.round(totalHours * PHASE_WEIGHTS[idx]);
    const l3List = [];
    for (let i = 0; i < l3PerPhase; i++) {
      l3List.push(themeL3Names[(idx * l3PerPhase + i) % themeL3Names.length]);
    }
    return buildL2(phase.code, phase.name, phaseHours, l3List);
  });

  const projectName = extractProjectName(sowText) || `【Mock】${theme}项目`;
  const l1Hours = l2Children.reduce((s, n) => s + n.estimatedHours, 0);

  const l1 = {
    id: '1',
    code: '1',
    name: projectName,
    level: 1,
    estimatedHours: l1Hours,
    children: l2Children,
  };

  push('info', 'skeleton', `✓ L1-L5 骨架已生成：${l1Hours}h`);

  if (!enableL4L5) {
    l1.children.forEach((l2) => {
      l2.children?.forEach((l3) => {
        l3.children = [];
      });
    });
  }

  const wbs = {
    meta: {
      projectName,
      projectCode: 'MOCK-' + Date.now().toString(36).toUpperCase().slice(-6),
      projectType: '预测型/Predictive',
      durationWeeks: Math.ceil(l1Hours / 40),
      durationMonths: Math.ceil(l1Hours / 160),
      deliverables: themeL3Names.slice(0, 6),
      scopeBoundary: { inScope: themeL3Names.slice(0, 3), outOfScope: ['硬件采购', '机房建设'] },
      assumptions: [`${theme}相关技术栈已就绪`, `甲方业务专家全程参与`],
      constraints: ['遵循等保三级要求', '交付物需通过甲方 PMO 评审'],
      stakeholders: [
        { role: '甲方 PMO', responsibility: '整体监管与决策' },
        { role: '乙方 PM', responsibility: '项目执行与交付' },
      ],
      sowLength: sowText.length,
      detectedTheme: theme,
    },
    milestones: [
      { id: 'M1', name: '启动会', phase: '启动', weekOffset: 1, deliverable: '项目章程' },
      { id: 'M2', name: '需求基线', phase: '规划', weekOffset: 4, deliverable: '需求规格说明书' },
      { id: 'M3', name: '设计评审', phase: '规划', weekOffset: 8, deliverable: '总体方案设计' },
      { id: 'M4', name: '开发完成', phase: '执行', weekOffset: Math.ceil(l1Hours / 40 * 0.7), deliverable: '系统代码' },
      { id: 'M5', name: 'UAT 验收', phase: '测试', weekOffset: Math.ceil(l1Hours / 40 * 0.9), deliverable: '验收报告' },
      { id: 'M6', name: '上线投产', phase: '部署', weekOffset: Math.ceil(l1Hours / 40), deliverable: '上线报告' },
    ],
    wbs: [l1],
  };

  // 校验 + 自适应修复（最多 5 轮）
  push('info', 'validate', '🔍 执行工时守恒 + 命名规范校验');
  let audit = validateWBS(wbs);
  let attempts = 0;
  while (!audit.passed && attempts < 5) {
    attempts++;
    push('warn', 'validate.fix', `🔧 第 ${attempts} 轮自动修复，errors=${audit.errors.length}`);
    const fixedHours = fixHourConsistency(wbs);
    const fixedNames = fixNames(wbs);
    audit = validateWBS(wbs);
    if (!fixedHours && !fixedNames) break;
  }

  push(
    audit.passed ? 'info' : 'warn',
    'validate.done',
    audit.passed
      ? `✓ 校验通过：${audit.stats.total} 节点 / ${audit.stats.totalHours}h`
      : `⚠️ 仍有 ${audit.errors.length} 个错误`,
    { passed: audit.passed, errors: audit.errors.slice(0, 5) },
  );

  push('info', 'end', `🎉 Mock 生成完成（${Date.now() - t0}ms）`, { totalNodes: audit.stats.total, totalHours: audit.stats.totalHours });

  return {
    wbs,
    audit,
    log,
    meta: wbs.meta,
    parseMethod: 'mock-degraded',
    summary: {
      parseMethod: 'mock-degraded',
      totalNodes: audit.stats.total,
      totalHours: audit.stats.totalHours,
      l3Count: audit.stats.byLevel?.[3] || 0,
      valid: audit.passed,
    },
  };
}

function ts() {
  return new Date().toISOString().slice(11, 23);
}
