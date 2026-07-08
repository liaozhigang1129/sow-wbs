// WBS 校验器（Node 版）— v2.7 重写：修复 estimatedHours 字段映射 + 校验完整 WBS 树 + 命名规范 + SOW 覆盖度
const OWNER_POOL = new Set(['PM', 'BA', 'AR', 'SR', 'DEV', 'QA', 'DATA', 'TL']);
// ⭐ v2.7 新增：owner 角色扩展（TL = Tech Lead）

const FORBIDDEN_VERBS = [
  '编写', '整理', '实现', '去', '搭建', '做', '给', '完成', '构建',
  '开发', '编码', '进行', '执行',
];

const DELIVERABLE_SUFFIXES = [
  '报告', '文档', '服务', '脚本', '模型', '工具', '引擎',
  '纪要', '方案', '规范', '模板', '手册', '套件', '平台',
  '索引', '台账', '评估', '策略', '规则集', '适配器',
  '解析器', '检测器', '识别器', '生成器', '工作台',
  '清单', '数据集', '评测集', '看板', '配置', '台', '中心',
];

const PROCESS_NOUNS = [
  '数据迁移', '系统集成测试', '代码评审', 'UAT', '用户验收测试',
  '性能压测', '灰度发布', '联调测试', 'E2E 联调',
  'Demo', 'Sprint 演示', '知识移交',
];

const STAGE_TERMS = ['评审', '基线', '签字', '定义', '规划', '选型', '测试', '演示', '部署', '上线', '验收', '移交', '评估', '决策', '管理'];

/**
 * ⭐ v2.16 新增：计算两个名称的语义重合度（v2 改进算法）
 * 用于检测同一父节点下 L3 工作包语义是否重合
 *
 * 算法：
 *   1. 提取 2-gram + 3-gram 中文关键词（过滤停用词）
 *   2. 子串包含检查（A 包含 B 或 B 包含 A → 视为重合）
 *   3. 计算 "包含率" = 交集 / min(|A|, |B|)
 *   4. 阈值 ≥ 0.5 视为重合
 */
function computeNameOverlap(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  if (nameA === nameB) return 1;

  // 停用词（虚词、连接词、量词、常见后缀）
  const STOPWORDS = new Set([
    '的', '与', '和', '及', '或', '等', '进行', '完成', '相关',
    '总体', '整体', '系统', '项目', '工作', '报告', '文档',
    '纪要', '方案', '模板', '规范', '工具', '服务', '平台',
  ]);

  // 提取关键词（中文 2-gram + 3-gram，英文按单词）
  function tokenize(name) {
    const tokens = [];
    const cn = name.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const seg of cn) {
      for (let i = 0; i < seg.length - 1; i++) {
        const t = seg.slice(i, i + 2);
        if (!STOPWORDS.has(t)) tokens.push(t);
      }
      // 3-gram 更精确
      for (let i = 0; i < seg.length - 2; i++) {
        const t = seg.slice(i, i + 3);
        if (!STOPWORDS.has(t)) tokens.push(t);
      }
    }
    const en = name.match(/[A-Za-z0-9]+/g) || [];
    for (const t of en) {
      if (t.length >= 2 && !STOPWORDS.has(t.toLowerCase())) tokens.push(t.toLowerCase());
    }
    return tokens;
  }

  const setA = new Set(tokenize(nameA));
  const setB = new Set(tokenize(nameB));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const min = Math.min(setA.size, setB.size);

  // "包含率"：较小集合被较大集合覆盖的程度
  const containment = intersection / min;

  // 子串包含：例如 "需求调研" 是 "需求调研与访谈" 的子串 → 直接判定重合
  if (nameA.includes(nameB) || nameB.includes(nameA)) {
    return Math.max(containment, 0.5);
  }

  return containment;
}

/**
 * ⭐ v2.7 修复：兼容多种字段名
 * LLM 输出可能是 estimatedHours / hours / effortHours
 */
function getHours(node) {
  return node.estimatedHours ?? node.hours ?? node.effortHours ?? node.durationHours ?? 0;
}

function getCode(node) {
  return node.code || node.wbsCode || node.id || '?';
}

function getChildren(node) {
  return node.children || node.workPackages || [];
}

function getName(node) {
  return node.name || '?';
}

function getOwner(node) {
  return node.owner;
}

function getLevel(node) {
  return node.level || 0;
}

function walk(node, path, errors, stats) {
  const lvl = getLevel(node);
  const hours = getHours(node);
  const name = getName(node);
  const owner = getOwner(node);
  const code = getCode(node);

  if (owner && !OWNER_POOL.has(owner)) {
    errors.push(`[${path}] owner=${owner} 不在角色池内 (PM/BA/AR/SR/DEV/QA/DATA/TL)`);
  }
  stats.total += 1;
  stats.totalHours += hours;
  stats.byLevel[lvl] = (stats.byLevel[lvl] || 0) + hours;

  const children = getChildren(node);

  // ⭐ 叶子节点校验
  if (children.length === 0) {
    // 叶子必须是 L4 或 L5（强制规则）
    if (lvl > 0 && lvl < 4) {
      // 例外：项目阶段性的"管理类"任务（如"周例会"）可在 L3 终止，但不超过总节点数的 10%
      if (!isManagementNode(name)) {
        errors.push(`[${path}] '${name}' 是 L${lvl} 叶子节点，必须下钻到 L4-L5（管理类节点除外）`);
      }
    }
    // 叶子必须有 deliverable
    if (!node.deliverable) {
      errors.push(`[${path}] 叶子节点 '${name}' 缺少 deliverable 字段`);
    }
    // 叶子必须有 owner
    if (!owner) {
      errors.push(`[${path}] 叶子节点 '${name}' 缺少 owner 字段`);
    }
    // 叶子必须有 sowEvidence（非管理类）
    if (!node.sowEvidence && !isManagementNode(name)) {
      errors.push(`[${path}] 叶子节点 '${name}' 缺少 sowEvidence 字段`);
    }
  }

  // 工时守恒
  if (children.length > 0) {
    const sum = children.reduce((a, c) => a + getHours(c), 0);
    if (Math.abs(sum - hours) > 0.5) {
      errors.push(`[${path}] 工时不守恒: parent=${hours}h, Σchildren=${sum}h, 漂移=${sum - hours}h`);
    }
    // 触发条件：L2 ≥40h 必须有 children；L3 ≥24h 必须有 grandchildren
    if (lvl === 2 && hours >= 40 && children.length === 0) {
      errors.push(`[${path}] L2 ≥40h 但没有 children，违���触发条件`);
    }
    if (lvl === 3 && hours >= 24 && children.length === 0) {
      errors.push(`[${path}] L3 ≥24h 但没有 grandchildren，违反触发条件`);
    }
    children.forEach((c) => {
      walk(c, `${path}/${getCode(c)}`, errors, stats);
    });
  } else {
    // 叶子节点工时必须 > 0
    if (hours <= 0) {
      errors.push(`[${path}] 叶子节点 '${name}' 工时必须 > 0`);
    }
  }

  // 命名规范（仅 L2+ 检查）
  if (lvl === 2 || lvl >= 3) {
    for (const v of FORBIDDEN_VERBS) {
      const re = new RegExp(`(^|\\s)${v}`);
      if (re.test(name)) {
        errors.push(`[${path}] '${name}' 含动作动词 '${v}'（违反命名规范）`);
        break;
      }
    }
    const hasSuffix = DELIVERABLE_SUFFIXES.some((s) => name.endsWith(s));
    const hasProcess = PROCESS_NOUNS.some((p) => name.includes(p));
    const hasStage = STAGE_TERMS.some((t) => name.includes(t));
    if (!hasSuffix && !hasProcess && !hasStage) {
      errors.push(`[${path}] '${name}' 缺少交付物/过程/阶段名词，命名过抽象`);
    }
  }
}

/**
 * 判断是否"管理类节点"（允许 L3 作为叶子）
 * 例如：周例会、日常巡检、阶段评审
 */
function isManagementNode(name) {
  const mgmtKeywords = ['周例会', '月例会', '日例会', '巡检', '汇报', '晨会', '站会', '评审会'];
  return mgmtKeywords.some((k) => name.includes(k));
}

/**
 * 校验完整 WBS JSON
 */
export function validateWBS(data) {
  const errors = [];
  const warnings = [];
  const stats = {
    total: 0,
    totalHours: 0,
    byLevel: {},
    leaves: 0,
    maxDepth: 0,
  };

  // ⭐ v2.7 修复：校验完整 WBS 树（不仅是 milestones.workPackages）
  const wbsTree = data.wbs || data.workPackages || [];
  if (Array.isArray(wbsTree) && wbsTree.length > 0) {
    wbsTree.forEach((root) => {
      const startPath = getCode(root);
      const startLevel = getLevel(root) || 1;
      walkWithDepth(root, startPath, errors, warnings, stats, startLevel, 1, null);
    });
  }

  // 同时保留里程碑下的 WP 校验（兼容老数据）
  const milestones = data.milestones || [];
  milestones.forEach((m) => {
    const mPath = `M${m.code || m.id || '?'}`;
    (m.workPackages || []).forEach((wp) => {
      const wp2 = { ...wp, level: wp.level || 2 };
      walk(wp2, `${mPath}/${getCode(wp)}`, errors, stats);
    });
  });

  // ⭐ v2.7 新增：基础质量门
  const meta = data.meta || {};
  if (!meta.durationWeeks && meta.durationWeeks !== 0) {
    warnings.push('[meta] 缺少 durationWeeks 字段');
  }
  if (meta.durationWeeks && meta.durationWeeks <= 0) {
    errors.push('[meta] durationWeeks 必须 > 0');
  }
  if (!meta.projectName) {
    warnings.push('[meta] 缺少 projectName');
  }
  if (!meta.projectCode) {
    warnings.push('[meta] 缺少 projectCode');
  }

  // ⭐ v2.7 新增：lifecyclePhases 校验
  const phases = data.lifecyclePhases || [];
  if (phases.length < 4) {
    warnings.push(`[lifecyclePhases] 数量过少 (${phases.length} < 4)`);
  }

  // ⭐ v2.7 新增：requirements 校验
  const reqs = data.requirements || [];
  if (reqs.length < 5) {
    warnings.push(`[requirements] 数量过少 (${reqs.length} < 5)`);
  }

  // ⭐ v2.7 新增：rtm 覆盖度校验
  const rtm = data.rtm || [];
  if (rtm.length < stats.leaves / 2) {
    warnings.push(`[rtm] 覆盖不足: ${rtm.length} 行 vs ${stats.leaves} 叶子（建议 ≥50% 覆盖）`);
  }

  // ⭐ v2.7 新增：总节点数提示
  if (stats.total > 200) {
    warnings.push(`[wbs] 节点数过多 (${stats.total} > 200)，可能导致截断`);
  }

  // 各层级工时一致性
  const distinct = new Set(Object.values(stats.byLevel));
  if (distinct.size > 1) {
    errors.push(`[总工时不守恒] 各层级工时: ${JSON.stringify(stats.byLevel)}`);
  }

  return {
    errors,
    warnings,
    stats,
    passed: errors.length === 0,
  };
}

/**
 * ⭐ v2.7 新增：带深度跟踪的 walk（用于统计 maxDepth 和 leaves）
 */
function walkWithDepth(node, path, errors, warnings, stats, lvl, depth, parentChildren = null) {
  const hours = getHours(node);
  const name = getName(node);
  const owner = getOwner(node);
  const code = getCode(node);

  // owner 校验
  if (owner && !OWNER_POOL.has(owner)) {
    errors.push(`[${path}] owner=${owner} 不在角色池内`);
  }

  // 统计
  stats.total += 1;
  stats.totalHours += hours;
  stats.byLevel[lvl] = (stats.byLevel[lvl] || 0) + hours;
  if (depth > stats.maxDepth) stats.maxDepth = depth;

  const children = getChildren(node);

  if (children.length === 0) {
    // 叶子
    stats.leaves += 1;
    // ⭐ v2.16 弹性层级：L3 也可以作为叶子（不再强制要求 L4-L5）
    // 只有 L1（阶段）和 L2（主要交付物）作为叶子时才报错
    if (lvl > 0 && lvl < 3 && !isManagementNode(name)) {
      errors.push(`[${path}] '${name}' 是 L${lvl} 叶子节点，阶段（L1）/主要交付物（L2）不应直接作为叶子，必须下钻`);
    }
    if (!node.deliverable && !isManagementNode(name)) {
      warnings.push(`[${path}] 叶子节点 '${name}' 缺少 deliverable 字段`);
    }
    if (!owner) {
      warnings.push(`[${path}] 叶子节点 '${name}' 缺少 owner 字段`);
    }
    if (!node.sowEvidence && !isManagementNode(name)) {
      warnings.push(`[${path}] 叶子节点 '${name}' 缺少 sowEvidence 字段`);
    }
    if (hours <= 0) {
      errors.push(`[${path}] 叶子节点 '${name}' 工时必须 > 0`);
    }

    // ⭐ v2.16 防重合检查（叶子分支内）：L3 作为叶子时也要检查与同级重合
    if (lvl === 3 && parentChildren && parentChildren.length > 1) {
      for (const sib of parentChildren) {
        if (sib === node) continue;
        const sibName = getName(sib);
        if (sibName === name) continue;
        const overlap = computeNameOverlap(name, sibName);
        if (overlap >= 0.5) {
          errors.push(`[${path}] L3 工作包 '${name}' 与同级 '${sibName}' 语义重合（包含率 ${(overlap * 100).toFixed(0)}% ≥ 50%），应合并`);
          break;
        }
      }
    }

    // ⭐ v2.16 L3 工时检查（叶子分支内）
    if (lvl === 3) {
      if (hours >= 160) {
        errors.push(`[${path}] L3 工作包工时 ${hours}h 严重超标（≥160h），必须继续分解为 L4-L5`);
      } else if (hours > 120) {
        warnings.push(`[${path}] L3 工作包工时 ${hours}h（>120h），作为叶子节点工时较大，可考虑分解`);
      }
    }
    return;
  }

  // 工时守恒
  const sum = children.reduce((a, c) => a + getHours(c), 0);
  if (Math.abs(sum - hours) > 0.5) {
    errors.push(`[${path}] 工时不守恒: parent=${hours}h, Σchildren=${sum}h, 漂移=${sum - hours}h`);
  }

  // 触发条件
  if (lvl === 2 && hours >= 40 && children.length === 0) {
    errors.push(`[${path}] L2 ≥40h 但没有 children`);
  }
  if (lvl === 3 && hours >= 24 && children.length === 0) {
    errors.push(`[${path}] L3 ≥24h 但没有 grandchildren`);
  }

  if (lvl === 3) {
    // ⭐ v2.16 L3 工时检查（适用于叶子 + 非叶子两种情况）
    const exceeds120 = hours > 120;
    const hasSubItems = children.length >= 2;

    if (hours >= 160) {
      errors.push(`[${path}] L3 工作包工时 ${hours}h 严重超标（≥160h），必须继续分解为 L4-L5`);
    } else if (exceeds120 && hasSubItems) {
      warnings.push(`[${path}] L3 工作包工时 ${hours}h（>120h）且 SOW 存在子项（${children.length} 个 L4），建议继续下钻到 L5`);
    } else if (exceeds120 && children.length < 2) {
      warnings.push(`[${path}] L3 工作包工时 ${hours}h（>120h），但 SOW 中无更细子项，可接受为单工作包`);
    }
  }

  // 子节点过多/过少检查（仅适用于非叶子，因为叶子走上面分支 return 了）
  if (lvl === 3 && children.length > 5) {
    warnings.push(`[${path}] L3 工作包 '${name}' 包含 ${children.length} 个子任务（>5），建议将 L4 进一步分解为 L5`);
  }
  if (lvl === 3 && children.length === 1) {
    warnings.push(`[${path}] L3 工作包 '${name}' 只有 1 个子任务，结构过于简单，可考虑合并`);
  }

  // ⭐ v2.16 防重合检查：同一父节点下 L3 工作包名称语义不得重合（阈值 0.5）
  // 无论 L3 是叶子还是非叶子，都需要检查（用 parentChildren 数组）
  if (lvl === 3 && parentChildren && parentChildren.length > 1) {
    for (const sib of parentChildren) {
      if (sib === node) continue;
      const sibName = getName(sib);
      if (sibName === name) continue;
      const overlap = computeNameOverlap(name, sibName);
      if (overlap >= 0.5) {
        errors.push(`[${path}] L3 工作包 '${name}' 与同级 '${sibName}' 语义重合（包含率 ${(overlap * 100).toFixed(0)}% ≥ 50%），应合并`);
        break; // 一对即可，避免重复报错
      }
    }
  }

  // ⭐ v2.9 新增：L2 主要交付物大小检查
  // L2 40h ≤ hours < 240h → warning
  // L2 hours >= 240h → error
  if (lvl === 2) {
    if (hours >= 320) {
      errors.push(`[${path}] L2 主要交付物工时 ${hours}h 严重超标（≥320h），应拆分为多个 L2`);
    } else if (hours > 240) {
      warnings.push(`[${path}] L2 主要交付物工时 ${hours}h 超过建议上限（240h），可考虑拆分`);
    }
  }

  // ⭐ v2.9 新增：L4 叶子节点大小检查
  if (lvl === 4 && children.length === 0) {
    if (hours >= 80) {
      warnings.push(`[${path}] L4 子任务工时 ${hours}h 过大，建议拆分为 L5`);
    } else if (hours < 4) {
      warnings.push(`[${path}] L4 子任务工时 ${hours}h 过小（<4h），可考虑合并`);
    }
  }

  // 命名规范（L2+）
  if (lvl === 2 || lvl >= 3) {
    for (const v of FORBIDDEN_VERBS) {
      const re = new RegExp(`(^|\\s)${v}`);
      if (re.test(name)) {
        errors.push(`[${path}] '${name}' 含动作动词 '${v}'`);
        break;
      }
    }
    const hasSuffix = DELIVERABLE_SUFFIXES.some((s) => name.endsWith(s));
    const hasProcess = PROCESS_NOUNS.some((p) => name.includes(p));
    const hasStage = STAGE_TERMS.some((t) => name.includes(t));
    if (!hasSuffix && !hasProcess && !hasStage) {
      errors.push(`[${path}] '${name}' 命名过抽象（需含交付物/过程/阶段名词）`);
    }
  }

  // 递归
  children.forEach((c) => {
    const childLvl = getLevel(c) || (lvl + 1);
    // ⭐ v2.16 透传 parentChildren（同级子节点数组），用于 L3 防重合检查
    walkWithDepth(c, `${path}/${getCode(c)}`, errors, warnings, stats, childLvl, depth + 1, children);
  });
}