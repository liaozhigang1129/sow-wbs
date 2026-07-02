// WBS 树状结构展示（适配 v2.5 数据结构：lifecyclePhases + wbs 数组 + milestones + requirements + rtm）
import React, { useMemo, useState } from 'react';

const OWNER_COLORS = {
  PM: 'bg-purple-100 text-purple-700',
  BA: 'bg-blue-100 text-blue-700',
  SA: 'bg-indigo-100 text-indigo-700',
  TL: 'bg-cyan-100 text-cyan-700',
  Dev: 'bg-green-100 text-green-700',
  QA: 'bg-yellow-100 text-yellow-700',
  Ops: 'bg-orange-100 text-orange-700',
  Data: 'bg-pink-100 text-pink-700',
  AR: 'bg-pink-100 text-pink-700',
  SR: 'bg-indigo-100 text-indigo-700',
};

const OWNER_LABEL = {
  PM: '项目经理',
  BA: '业务分析师',
  SA: '架构师',
  TL: '研发负责人',
  Dev: '开发工程师',
  QA: '测试/QA',
  Ops: '运维',
  Data: '数据工程',
  AR: 'AI/算法',
  SR: '系统架构',
};

const PHASE_COLORS = [
  'border-l-blue-400',
  'border-l-emerald-400',
  'border-l-amber-400',
  'border-l-purple-400',
  'border-l-pink-400',
  'border-l-cyan-400',
  'border-l-orange-400',
  'border-l-red-400',
];

function TreeNode({ node, depth = 0, expanded, onToggle, search, onLocateInSow }) {
  const hasChildren = node.children && node.children.length > 0;
  // 关键：用 id || code 作为展开 key，保证每个节点都有唯一稳定的 key
  const nodeKey = node.id || node.code || `node-${depth}-${Math.random()}`;
  const isOpen = expanded[nodeKey] !== false;

  const matchesSearch =
    search &&
    (node.name?.toLowerCase().includes(search.toLowerCase()) ||
      node.code?.toLowerCase().includes(search.toLowerCase()) ||
      node.deliverable?.toLowerCase().includes(search.toLowerCase()));

  // 深度配色：L1=品牌色 → L5=灰色（视觉收敛）
  const depthStyles = [
    // L1 阶段节点：醒目品牌色 + 加粗 + 大字号
    'bg-gradient-to-r from-brand-50 to-brand-100/70 border-l-4 border-l-brand-500 text-slate-900',
    // L2 主要交付物：浅品牌色 + 边框
    'bg-brand-50/40 border-l-[3px] border-l-brand-300 text-slate-800',
    // L3 工作包：浅灰 + 缩进边框
    'bg-slate-50/80 border-l-2 border-l-slate-300 text-slate-800',
    // L4 子任务：极浅背景 + 虚线边框 + 强调
    'bg-amber-50/40 border-l-2 border-l-dashed border-l-amber-400 text-slate-700 font-medium',
    // L5+ 细分子任务：浅绿 + 点状边框（叶子节点）
    'bg-emerald-50/30 border-l border-l-emerald-300 text-slate-600 text-xs',
  ];
  const baseStyle = depthStyles[Math.min(depth, depthStyles.length - 1)];

  // 深度对应左边距缩进（视觉阶梯）
  const depthPadding = depth === 0 ? 'pl-3 py-2' : depth <= 2 ? 'pl-2 py-1.5' : 'pl-1.5 py-1';

  return (
    <li>
      <div
        className={`flex items-start gap-2 ${depthPadding} rounded-r transition-colors
          ${baseStyle}
          hover:bg-brand-50/60
          ${matchesSearch ? 'ring-2 ring-amber-300' : ''}`}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(nodeKey)}
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 mt-0.5 flex-shrink-0"
            title={`${isOpen ? '收起' : '展开'} (L${depth + 1})`}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
            {/* 深度徽章：L1/L2/L3/L4/L5 */}
            <span
              className={`font-mono text-[10px] px-1 rounded flex-shrink-0 font-bold
                ${depth === 0 ? 'bg-brand-600 text-white' :
                  depth === 1 ? 'bg-brand-200 text-brand-800' :
                  depth === 2 ? 'bg-slate-200 text-slate-700' :
                  depth === 3 ? 'bg-amber-200 text-amber-800' :
                  'bg-emerald-200 text-emerald-800'}`}
              title={`层级 ${depth + 1}${depth >= 3 ? '（叶子节点）' : ''}`}
            >
              L{depth + 1}
            </span>
            <span className={`font-mono text-xs flex-shrink-0 ${depth === 0 ? 'text-slate-600 font-semibold' : 'text-slate-500'}`}>
              {node.code}
            </span>
            <span className={`font-medium ${depth === 0 ? 'text-base font-bold' : depth === 1 ? 'text-sm font-semibold' : 'text-sm'}`}>
              {node.name}
            </span>
            {node.owner && (
              <span
                className={`badge text-[10px] flex-shrink-0 ${
                  OWNER_COLORS[node.owner] || 'bg-slate-100 text-slate-700'
                }`}
                title={OWNER_LABEL[node.owner] || node.owner}
              >
                {node.owner}
              </span>
            )}
            {typeof node.estimatedHours === 'number' && node.estimatedHours > 0 && (
              <span className="badge bg-slate-100 text-slate-700 text-[10px] flex-shrink-0">
                {node.estimatedHours}h
              </span>
            )}
          </div>
          {node.deliverable && (
            <div className={`mt-0.5 ${depth >= 3 ? 'text-[11px]' : 'text-xs'} text-slate-600`}>
              📦 {node.deliverable}
            </div>
          )}
          {node.sowEvidence && (
            <div
              className={`mt-0.5 italic text-slate-500 ${depth >= 3 ? 'text-[10px]' : 'text-[11px]'} 
                ${onLocateInSow ? 'cursor-pointer hover:text-brand-600 hover:bg-brand-50/50 px-1 rounded transition-colors' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onLocateInSow) onLocateInSow(node.sowEvidence);
              }}
              title={onLocateInSow ? '点击定位到 SOW 文档' : ''}
            >
              🔗 {node.sowEvidence}
              {onLocateInSow && (
                <span className="ml-1 text-brand-500 opacity-0 group-hover:opacity-100">📍</span>
              )}
            </div>
          )}
        </div>
      </div>
      {hasChildren && isOpen && (
        <ul
          className={`ml-4 pl-2 border-l-2 ${
            depth === 0 ? 'border-brand-200' :
            depth === 1 ? 'border-slate-200' :
            'border-slate-100 border-dashed'
          }`}
        >
          {node.children.map((c) => (
            <TreeNode
              key={c.id || c.code || `node-${depth + 1}-${Math.random()}`}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              search={search}
              onLocateInSow={onLocateInSow}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function WBSTree({ wbs, onLocateInSow }) {
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [filterPhase, setFilterPhase] = useState('all');
  // ⭐ 层级视图模式：all=全部、wp=只看 L3 工作包、custom=自定义层级
  const [levelMode, setLevelMode] = useState('all');
  const [customLevels, setCustomLevels] = useState([1, 2, 3, 4, 5]);
  const [showMilestones, setShowMilestones] = useState(false);  // 默认折叠里程碑
  const [showRtm, setShowRtm] = useState(false);  // 默认折叠 RTM

  const toggle = (id) =>
    setExpanded((e) => ({ ...e, [id]: e[id] === false ? true : false }));

  /**
   * ⭐ WP（工作包）剪枝函数
   * 把 L3 工作包提到顶层，并保留其祖先路径信息（ancestorChain）用于上下文展示
   * 这样用户点击 [只看工作包] 后，能直接看到所有 WP 清单
   */
  const extractWorkPackages = (nodes) => {
    const result = [];
    function walk(arr, chain = []) {
      arr.forEach((n) => {
        const lvl = n.level || chain.length + 1;
        const isWorkPackage = lvl === 3 && (!n.children || n.children.length === 0)
          || (lvl === 3); // L3 即为 WP（即使有 L4 子任务也归为 WP）
        if (isWorkPackage) {
          result.push({
            ...n,
            _ancestorChain: chain.map((a) => ({ code: a.code, name: a.name, level: a.level })),
          });
        } else if (n.children?.length) {
          walk(n.children, [...chain, { code: n.code, name: n.name, level: lvl }]);
        }
      });
    }
    walk(nodes);
    return result;
  };

  const expandAll = () => {
    const all = {};
    function walk(nodes) {
      nodes.forEach((n) => {
        const k = n.id || n.code;
        if (n.children?.length) {
          if (k) all[k] = true;
          walk(n.children);
        }
      });
    }
    walk(wbs?.wbs || []);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  // 展开到指定层级（expansion helper）
  const expandToLevel = (targetLevel) => {
    const all = {};
    function walk(nodes, depth = 1) {
      nodes.forEach((n) => {
        const k = n.id || n.code;
        if (k && depth < targetLevel && n.children?.length) {
          all[k] = true;
          walk(n.children, depth + 1);
        }
      });
    }
    walk(wbs?.wbs || []);
    setExpanded(all);
  };

  // 统计
  const stats = useMemo(() => {
    if (!wbs?.wbs) return { nodes: 0, hours: 0, leaves: 0, depthDist: {}, maxDepth: 0 };
    let nodes = 0;
    let hours = 0;
    let leaves = 0;
    const depthDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let maxDepth = 0;
    function walk(arr, depth = 1) {
      arr.forEach((n) => {
        nodes++;
        hours += n.estimatedHours || 0;
        if (!n.children || n.children.length === 0) leaves++;
        if (depth <= 5) depthDist[depth] = (depthDist[depth] || 0) + 1;
        else depthDist[5] = (depthDist[5] || 0) + 1;
        maxDepth = Math.max(maxDepth, depth);
        if (n.children?.length) walk(n.children, depth + 1);
      });
    }
    walk(wbs.wbs);
    return { nodes, hours, leaves, depthDist, maxDepth };
  }, [wbs]);

  // 渲染检查
  if (!wbs) {
    return (
      <div className="text-center text-slate-400 py-20">
        <div className="text-5xl mb-3">🌳</div>
        <div>导入 SOW 后，点击"开始生成 WBS"以查看分解结果</div>
      </div>
    );
  }

  // ⭐ v2.6 诊断日志：开发模式下显示 wbs 数据概况
  if (typeof window !== 'undefined' && window.console) {
    const topCount = wbs.wbs?.length || 0;
    let totalNodes = 0;
    (function w(n) {
      if (!n) return;
      totalNodes++;
      n.children?.forEach(w);
    })((wbs.wbs || [])[0] || null);
    console.log(
      `[WBSTree] wbs 数据概况: 顶层 ${topCount} 个 L1，总节点 ${totalNodes}, lifecyclePhases ${wbs.lifecyclePhases?.length || 0} 个`
    );
  }

  // 兼容旧格式（milestones.workPackages）
  const oldFormat = !wbs.wbs && wbs.milestones;
  if (oldFormat) {
    return (
      <div className="wbs-tree-legacy p-2">
        <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded mb-3">
          ⚠️ 检测到旧版本数据结构（milestones.workPackages），请使用新版 prompt 重新生成
        </div>
        {(wbs.milestones || []).map((m) => (
          <div key={m.code} className="mb-3 card p-3">
            <div className="font-semibold">
              M{m.code} · {m.name}
            </div>
            <ul className="mt-2">
              {(m.workPackages || []).map((wp) => (
                <li key={wp.wbsCode} className="text-sm py-1">
                  <span className="font-mono text-xs text-slate-500">{wp.wbsCode}</span> · {wp.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // 新版数据结构
  const phases = wbs.lifecyclePhases || [];
  const topNodes = wbs.wbs || [];

  // ⭐ v2.6 防御：如果 wbs.wbs 为空但 lifecyclePhases 有数据，显示提示
  if (topNodes.length === 0 && phases.length === 0) {
    return (
      <div className="text-center text-amber-700 bg-amber-50 border border-amber-200 rounded p-6 my-4">
        <div className="text-3xl mb-2">⚠️</div>
        <div className="font-medium mb-1">WBS 数据为空</div>
        <div className="text-xs text-slate-600">
          API 返回了数据但 wbs.wbs[] 数组为空。可能原因：<br/>
          1. LLM 输出被截断（max_tokens 不够）<br/>
          2. JSON 解析失败（看后端日志 /api/generate 的 audit.log）<br/>
          3. SOW 太短或描述不清，LLM 无法生成 WBS<br/>
          <br/>
          建议：检查浏览器 Console 是否有 [WBSTree] 日志，并查看后端 srv.log 中的 [parse.fail] / [parse.continue] 记录。
        </div>
      </div>
    );
  }

  // 按 lifecyclePhases 过滤顶层节点
  const filteredTop = filterPhase === 'all'
    ? topNodes
    : topNodes.filter((n) => n.name === filterPhase);

  // ⭐ 工作包模式：把 L3 节点剪枝出来作为顶层展示
  const workPackages = useMemo(() => extractWorkPackages(filteredTop), [filteredTop]);

  // ⭐ 计算工作包统计
  const wpStats = useMemo(() => {
    let hours = 0;
    let withDeliverable = 0;
    workPackages.forEach((wp) => {
      hours += wp.estimatedHours || 0;
      if (wp.deliverable) withDeliverable++;
    });
    return { count: workPackages.length, hours, withDeliverable };
  }, [workPackages]);

  /**
   * 工作包节点渲染（扁平卡片列表）
   * 展示：祖先路径 + WP 编码 + 名称 + 责任人 + 工时 + 交付物
   */
  const renderWorkPackageCard = (wp, idx) => {
    const ancestors = wp._ancestorChain || [];
    return (
      <div
        key={wp.id || wp.code || `wp-${idx}`}
        className={`border-l-4 pl-3 mb-2 ${PHASE_COLORS[idx % PHASE_COLORS.length]}`}
      >
        {/* 祖先面包屑（路径上下文） */}
        {ancestors.length > 0 && (
          <div className="text-[10px] text-slate-500 mb-1 flex items-center flex-wrap gap-1">
            <span className="text-slate-400">📍</span>
            {ancestors.map((a, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="font-mono text-slate-600">{a.code}</span>
                <span className="text-slate-400">{a.name}</span>
                {i < ancestors.length - 1 && <span className="text-slate-300">›</span>}
              </span>
            ))}
            <span className="text-slate-300">›</span>
            <span className="font-semibold text-brand-700">WP</span>
          </div>
        )}

        {/* WP 主体卡片 */}
        <div className="bg-white border border-slate-200 rounded-md p-3 hover:shadow-md hover:border-brand-300 transition-all">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center flex-wrap gap-2 flex-1 min-w-0">
              <span className="badge bg-brand-600 text-white text-[10px] font-bold flex-shrink-0">WP</span>
              <span className="font-mono text-xs text-slate-700 font-semibold">{wp.code}</span>
              <span className="font-semibold text-sm text-slate-900">{wp.name}</span>
              {wp.owner && (
                <span className={`badge text-[10px] flex-shrink-0 ${
                  OWNER_COLORS[wp.owner] || 'bg-slate-100 text-slate-700'
                }`} title={OWNER_LABEL[wp.owner] || wp.owner}>
                  {wp.owner}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {typeof wp.estimatedHours === 'number' && wp.estimatedHours > 0 && (
                <span className="badge bg-brand-100 text-brand-700 text-[10px] font-semibold">
                  ⏱️ {wp.estimatedHours}h
                </span>
              )}
            </div>
          </div>

          {/* 交付物 */}
          {wp.deliverable && (
            <div className="text-xs text-slate-700 mt-1.5 flex items-start gap-1">
              <span className="flex-shrink-0">📦</span>
              <span className="flex-1">{wp.deliverable}</span>
            </div>
          )}

          {/* SOW 证据 */}
          {wp.sowEvidence && (
            <div
              className={`text-[11px] italic text-slate-500 mt-1 flex items-start gap-1 
                cursor-pointer hover:text-brand-600 hover:bg-brand-50/50 px-1 rounded transition-colors`}
              onClick={(e) => {
                e.stopPropagation();
                if (onLocateInSow) onLocateInSow(wp.sowEvidence);
              }}
              title="点击定位到 SOW 文档"
            >
              <span className="flex-shrink-0">🔗</span>
              <span className="flex-1">{wp.sowEvidence}</span>
              <span className="flex-shrink-0 text-brand-500">📍</span>
            </div>
          )}

          {/* L4 子任务（如果存在） */}
          {wp.children && wp.children.length > 0 && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-brand-600 select-none">
                ▸ 含 {wp.children.length} 个子任务（展开查看）
              </summary>
              <ul className="mt-1.5 pl-3 border-l-2 border-slate-200 space-y-1">
                {wp.children.map((c, i) => (
                  <li key={c.id || c.code || i} className="flex items-start gap-2">
                    <span className="badge bg-amber-100 text-amber-700 text-[9px] font-bold flex-shrink-0">L4</span>
                    <span className="font-mono text-[10px] text-slate-500 flex-shrink-0">{c.code}</span>
                    <span className="flex-1">{c.name}</span>
                    {c.estimatedHours > 0 && (
                      <span className="text-[10px] text-slate-400">{c.estimatedHours}h</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="wbs-tree-v2">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="🔍 搜索节点..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs px-2 py-1 border border-slate-300 rounded w-32 focus:w-48 transition-all focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value)}
            className="text-xs px-2 py-1 border border-slate-300 rounded"
          >
            <option value="all">全部分阶段</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs" title="各层级节点分布">
            {Object.entries(stats.depthDist || {})
              .filter(([_, c]) => c > 0)
              .map(([d, c]) => (
                <span
                  key={d}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px]
                    ${d === '1' ? 'bg-brand-600 text-white' :
                      d === '2' ? 'bg-brand-200 text-brand-800' :
                      d === '3' ? 'bg-slate-200 text-slate-700' :
                      d === '4' ? 'bg-slate-100 text-slate-600' :
                      'bg-slate-50 text-slate-500'}`}
                  title={`第 ${d} 层节点`}
                >
                  L{d}={c}
                </span>
              ))}
          </div>
          <span className="text-xs text-slate-500">
            📊 {stats.nodes} 节点 / {stats.leaves} 叶子 / {stats.hours}h / 最深 L{stats.maxDepth}
          </span>
          {/* ⭐ 视图模式切换：全部 / 工作包 / 自定义层级 */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200" title="视图模式">
            <span className="text-[10px] text-slate-500">视图:</span>
            <button
              onClick={() => setLevelMode('all')}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                levelMode === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 hover:bg-brand-100 text-slate-600 hover:text-brand-700'
              }`}
              title="完整层级树"
            >
              🌲 全部
            </button>
            <button
              onClick={() => setLevelMode('wp')}
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                levelMode === 'wp'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 hover:bg-brand-100 text-slate-600 hover:text-brand-700'
              }`}
              title="只看 L3 工作包（剪枝模式）"
            >
              📋 只看工作包
              {wpStats.count > 0 && (
                <span className="ml-1 opacity-70">({wpStats.count})</span>
              )}
            </button>
          </div>
          <button
            onClick={expandAll}
            className="text-xs px-2 py-1 text-brand-600 hover:bg-brand-50 rounded"
          >
            ▾ 全部展开
          </button>
          <button
            onClick={collapseAll}
            className="text-xs px-2 py-1 text-slate-600 hover:bg-slate-100 rounded"
          >
            ▸ 全部收起
          </button>
          {/* 展开到指定层级（最多到 L5） */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200" title="展开到指定层级">
            <span className="text-[10px] text-slate-500">展开到:</span>
            {[2, 3, 4, 5].map((lv) => (
              <button
                key={lv}
                onClick={() => expandToLevel(lv)}
                disabled={stats.maxDepth < lv}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-brand-100 text-slate-600 hover:text-brand-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-100"
              >
                L{lv}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 阶段进度条 */}
      {phases.length > 0 && (
        <div className="flex items-center gap-1 mb-4 text-[10px]">
          {phases.map((p, i) => (
            <div
              key={p}
              className={`flex-1 px-2 py-1 rounded text-center cursor-pointer transition-colors
                ${filterPhase === p ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              onClick={() => setFilterPhase(filterPhase === p ? 'all' : p)}
              title={`点击筛选 ${p}`}
            >
              {i + 1}.{p}
            </div>
          ))}
        </div>
      )}

      {/* ⭐ WP 模式工作包统计条 */}
      {levelMode === 'wp' && workPackages.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-gradient-to-r from-brand-50 to-blue-50 border border-brand-200 rounded-md flex items-center gap-3 flex-wrap text-xs">
          <span className="font-semibold text-brand-700">📋 工作包清单</span>
          <span className="text-slate-600">
            共 <b className="text-brand-700">{wpStats.count}</b> 个 WP
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">
            总工时 <b className="text-brand-700">{wpStats.hours}h</b>
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600">
            含交付物 <b className="text-emerald-700">{wpStats.withDeliverable}</b>/{wpStats.count}
          </span>
          {search && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-amber-700">
                🔍 筛选 "{search}"
              </span>
            </>
          )}
        </div>
      )}

      {/* 主树 */}
      <div className="space-y-2">
        {levelMode === 'wp' ? (
          /* ⭐ 工作包模式：扁平卡片列表 */
          workPackages.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">
              <div className="text-3xl mb-2">📭</div>
              <div>未发现 L3 工作包节点</div>
              <div className="text-xs mt-1">可能当前选中的阶段下没有 WP，请切换为「全部」视图</div>
            </div>
          ) : (
            <div className="space-y-2">
              {workPackages
                .filter((wp) => {
                  if (!search) return true;
                  const s = search.toLowerCase();
                  return (
                    wp.name?.toLowerCase().includes(s) ||
                    wp.code?.toLowerCase().includes(s) ||
                    wp.deliverable?.toLowerCase().includes(s)
                  );
                })
                .map((wp, idx) => renderWorkPackageCard(wp, idx))}
            </div>
          )
        ) : /* 完整树模式（保留原有逻辑） */
          filteredTop.length === 0 ? (
            <div className="text-center text-slate-400 py-10 text-sm">无匹配节点</div>
          ) : (
            <div className="space-y-3">
              {filteredTop.map((node, idx) => (
                <div
                  key={node.id || node.code}
                  className={`border-l-4 pl-3 ${PHASE_COLORS[idx % PHASE_COLORS.length]}`}
                >
                  <TreeNode
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggle}
                    search={search}
                    onLocateInSow={onLocateInSow}
                  />
                </div>
              ))}
            </div>
          )}
      </div>

      {/* 配套：里程碑 + RTM 预览（默认折叠，让 WBS 主树占主视觉） */}
      {(wbs.milestones?.length > 0 || wbs.rtm?.length > 0) && (
        <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3">
          {wbs.milestones?.length > 0 && (
            <div className="card p-3">
              <button
                onClick={() => setShowMilestones(!showMilestones)}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="font-semibold text-sm">🏁 关键里程碑 ({wbs.milestones.length})</h4>
                <span className="text-xs text-slate-500">{showMilestones ? '▾ 收起' : '▸ 展开'}</span>
              </button>
              {showMilestones && (
                <ul className="space-y-1">
                  {wbs.milestones.map((m) => (
                    <li key={m.id} className="text-xs flex items-start gap-2">
                      <span className="font-mono text-slate-500 flex-shrink-0">{m.id}</span>
                      <span className="flex-1">{m.name}</span>
                      <span className="text-slate-400 text-[10px]">W{m.weekOffset}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {wbs.rtm?.length > 0 && (
            <div className="card p-3">
              <button
                onClick={() => setShowRtm(!showRtm)}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="font-semibold text-sm">🔗 RTM 追溯 ({wbs.rtm.length})</h4>
                <span className="text-xs text-slate-500">{showRtm ? '▾ 收起' : '▸ 展开'}</span>
              </button>
              {showRtm && (
                <div className="max-h-32 overflow-y-auto text-xs">
                  <table className="w-full">
                    <thead className="text-slate-500 sticky top-0 bg-white">
                      <tr>
                        <th className="text-left">需求</th>
                        <th className="text-left">→</th>
                        <th className="text-left">WBS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wbs.rtm.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="font-mono text-brand-600">{r.requirementId}</td>
                          <td>→</td>
                          <td className="font-mono text-brand-600">{r.wbsId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
