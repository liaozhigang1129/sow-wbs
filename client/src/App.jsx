import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import WBSTree from './components/WBSTree.jsx';
import MetaPanel from './components/MetaPanel.jsx';
import AIConfig from './components/AIConfig.jsx';
import LogPanel from './components/LogPanel.jsx';
import SOWPreview from './components/SOWPreview.jsx';
import { uploadSOW, generateWBS, mockGenerate, validateWBS, exportFile, expandL3, fetchDefaultLLM } from './utils/api.js';
import { loadConfig } from './utils/config.js';

/**
 * ⭐ v2.18: 可水平拖拽的分割条（用于左右两栏之间调整宽度）
 * - 用 ref 暂存最近一次拖拽产生的最终宽度，父组件负责实际渲染
 * - 拖拽时通过 document 全局监听 mouseup，提升体验
 */
function ResizeHandle({ onResize, onReset, defaultRatio, containerWidth }) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    // 当前实际像素宽度从 DOM 读取
    const col = e.currentTarget.previousElementSibling;
    startWidthRef.current = col ? col.getBoundingClientRect().width : 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const next = Math.max(180, Math.min(containerWidth - 200, startWidthRef.current + delta));
      onResize(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize, containerWidth]);

  return (
    <div
      className="group relative w-1.5 flex-shrink-0 cursor-col-resize hover:bg-brand-300/40 active:bg-brand-500/60 transition-colors flex items-center justify-center"
      onMouseDown={onMouseDown}
      onDoubleClick={onReset}
      title="拖拽调整宽度 · 双击重置"
    >
      <div className="w-0.5 h-8 bg-slate-300 group-hover:bg-brand-500 transition-colors rounded-full" />
    </div>
  );
}

/**
 * WBS 头部统计：完全按 /api/generate 返回的 wbs 树结构计算
 * 输入: wbs = { meta, lifecyclePhases, wbs:[{id,code,name,level,estimatedHours,children:[...]}], milestones?, requirements?, rtm? }
 */
function WbsStats({ wbs }) {
  const stats = useMemo(() => {
    const out = { total: 0, leaves: 0, hours: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
    function walk(n, d = 1) {
      if (!n) return;
      out.total++;
      // ⭐ 优先用递归深度 d，其次用 n.level 字段（兜底），越界归入 '6+'
      let lv;
      if (n.level >= 1 && n.level <= 5) lv = n.level;
      else if (d >= 1 && d <= 5) lv = d;
      else lv = 6;
      out.byLevel[lv] = (out.byLevel[lv] || 0) + 1;
      if (Array.isArray(n.children) && n.children.length > 0) {
        n.children.forEach((c) => walk(c, d + 1));
      } else {
        out.leaves++;
      }
      // ⭐ 兼容多种小时数字段名
      const hrs = n.estimatedHours ?? n.hours ?? n.effortHours ?? n.durationHours;
      if (typeof hrs === 'number' && hrs > 0) out.hours += hrs;
    }
    (wbs.wbs || []).forEach(walk);
    return out;
  }, [wbs]);

  const ms = wbs.milestones?.length || 0;
  const phases = wbs.lifecyclePhases?.length || 0;

  return (
    <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
      <span>
        🌿 <b className="text-brand-600">{stats.byLevel[1] || 0}</b> 阶段
      </span>
      <span>
        📦 <b className="text-brand-600">{stats.byLevel[2] || 0}</b> 主要交付物
      </span>
      <span>
        🔧 <b className="text-brand-600">{stats.byLevel[3] || 0}</b> 工作包
      </span>
      {(stats.byLevel[4] || 0) > 0 && (
        <span>
          📑 <b className="text-amber-600">{stats.byLevel[4]}</b> L4 子任务
        </span>
      )}
      {(stats.byLevel[5] || 0) > 0 && (
        <span>
          🎯 <b className="text-emerald-600">{stats.byLevel[5]}</b> L5 叶子
        </span>
      )}
      {(stats.byLevel[6] || 0) > 0 && (
        <span>
          ➕ <b className="text-rose-600">{stats.byLevel[6]}</b> L6+
        </span>
      )}
      <span className="text-slate-400">·</span>
      <span title="总节点 / 叶子 / 工时">📊 {stats.total} 节点 / {stats.leaves} 叶子 / {stats.hours}h</span>
      {ms > 0 && <span>🏁 {ms} 里程碑</span>}
      {phases > 0 && phases !== stats.byLevel[1] && <span className="text-slate-400">({phases} phases)</span>}
    </div>
  );
}

export default function App() {
  const [sowText, setSowText] = useState('');
  const [sowMeta, setSowMeta] = useState(null);
  const [sowFile, setSowFile] = useState(null); // ⭐ 原始文件 base64
  const [sowParagraphs, setSowParagraphs] = useState([]); // ⭐ v2.14: 段落索引（用于 docx 定位）
  const [wbs, setWbs] = useState(null);
  const [audit, setAudit] = useState(null);
  const [log, setLog] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [error, setError] = useState('');
  const [cfg] = useState(loadConfig());
  const [highlightText, setHighlightText] = useState('');
  // ⭐ 分解粒度控制：true=L1-L5 完整, false=L1-L3 仅到工作包
  const [enableL4L5, setEnableL4L5] = useState(false);
  // ⭐ v3.0: 按需展开 L3 状态（正在展开的 L3 code）
  const [expandingL3, setExpandingL3] = useState(null);
  // ⭐ v3.x: 系统兜底 LLM 配置（启动时拉一次，{ provider, baseUrl, model, apiKeyPresent, label, ... }）
  const [systemDefault, setSystemDefault] = useState(null);
  // ⭐ v3.x: 当前请求实际使用的 LLM（手动 / 兜底），用于在 UI 提示
  const [activeLLM, setActiveLLM] = useState(null);

  // ⭐ v2.18: 三栏宽度（像素），可拖拽调整
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [leftColWidth, setLeftColWidth] = useState(280);   // 控制台（左）
  const [middleColWidth, setMiddleColWidth] = useState(420); // SOW 预览（中）

  // 监听实际容器宽度（响应式）
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 重置列宽为默认比例
  const resetLayout = useCallback(() => {
    if (!containerWidth) return;
    setLeftColWidth(containerWidth * 0.18);
    setMiddleColWidth(containerWidth * 0.28);
  }, [containerWidth]);

  // 定位到 SOW 文档中的对应内容并高亮
  const onLocateInSow = useCallback((evidence) => {
    if (!evidence) return;
    setHighlightText(evidence);

    // 8 秒后自动清除高亮
    setTimeout(() => setHighlightText(''), 8000);
  }, []);

  const onFile = useCallback(async (file) => {
    if (!file) return;
    setError('');
    setProgress('📤 正在上传与解析文档…');
    try {
      const r = await uploadSOW(file);
      setSowText(r.text);
      setSowMeta(r.meta);
      // ⭐ 保存原始文件用于文档预览
      setSowFile(r.file || null);
      // ⭐ v2.14: 保存段落数组（docx 高亮定位用）
      setSowParagraphs(r.paragraphs || []);
      setProgress(`✅ 解析成功 (${r.text.length.toLocaleString()} 字符)`);
      setTimeout(() => setProgress(''), 2000);
    } catch (e) {
      setError(e.message);
      setProgress('');
    }
  }, []);

  const onGenerate = useCallback(async () => {
    if (!sowText.trim()) {
      setError('请先上传 SOW 文件或粘贴文本');
      return;
    }
    // ⭐ v3.x：自动兜底——未配 apiKey 时优先使用系统兜底 LLM
    let cfgToUse = cfg;
    let usingFallback = false;
    if (!cfg.apiKey) {
      if (systemDefault && systemDefault.apiKeyPresent) {
        cfgToUse = {
          ...cfg,
          provider: systemDefault.provider,
          baseUrl: systemDefault.baseUrl,
          model: systemDefault.model,
          // ⚠️ apiKey 不从前端直填（前端永远拿不到明文）——直接交给后端 .env 兜底
          apiKey: '__system_default__', // 仅占位，后端检测到空 / 占位时优先用 env
        };
        usingFallback = true;
        setActiveLLM({ source: 'system', label: systemDefault.label, model: systemDefault.model });
      } else {
        setError('未配置 API Key，且系统兜底 LLM 也未配置 API Key。请点击右上角 ⚙️ 配置，或联系管理员在 .env 设置 HEXAI_API_KEY。');
        setShowConfig(true);
        return;
      }
    } else {
      setActiveLLM({ source: 'user', label: `${cfg.provider} / ${cfg.model}`, model: cfg.model });
    }
    setLoading(true);
    setError('');
    setLog([]);
    setMeta(null);
    setProgress(enableL4L5 ? '🤖 AI 正在生成 WBS L1-L5（可能需要 1-3 分钟）…' : '⚡ AI 正在生成 WBS L1-L3 骨架（约 30-60 秒,生成后可点击 L3 节点按需展开 L4-L5）…');
    try {
      const { wbs: w, audit: a, log: l, meta: m } = await generateWBS(sowText, cfgToUse, { enableL4L5 });
      setWbs(w);
      setAudit(a);
      setLog(l || []);
      setMeta(m || null);
      // ⭐ 调试用：在浏览器 DevTools Console 可访问 window.__wbs__
      if (typeof window !== 'undefined') window.__wbs__ = w;
      const fallbackTag = usingFallback ? '（系统兜底 LLM）' : '';
      const tip = a.parseWarning
        ? `⚠️ 生成完成（${a.parseMethod}）${fallbackTag}`
        : a.passed
        ? `✅ 生成完成 + 校验通过（${a.parseMethod}）${fallbackTag}`
        : `⚠️ 生成完成，但有 ${a.errors.length} 个校验问题（${a.parseMethod}）${fallbackTag}`;
      setProgress(tip);
      setTimeout(() => setProgress(''), 5000);
    } catch (e) {
      setError(e.message);
      setProgress('');
      // 服务器返回的错误也带 log（如果有）
      if (e.log && Array.isArray(e.log) && e.log.length > 0) {
        setLog(e.log);
      }
    } finally {
      setLoading(false);
    }
  }, [sowText, cfg, enableL4L5, systemDefault]);

  // ⭐ v3.x：启动时拉一次系统兜底配置缓存到 state
  useEffect(() => {
    let cancelled = false;
    fetchDefaultLLM()
      .then((d) => {
        if (!cancelled && d && d.ok) setSystemDefault(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 模拟生成：演示日志面板与导出按钮，不调用真实 LLM
  const onMockGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    setLog([]);
    setMeta(null);
    setWbs(null);
    setAudit(null);
    setProgress('🧪 模拟生成中…');
    try {
      const { wbs: w, log: l } = await mockGenerate(sowText || '【模拟 SOW】行内信贷智能体建设项目', { enableL4L5 });
      setWbs(w);
      setLog(l || []);
      setProgress('✅ 模拟生成完成（不消耗 API）');
      setTimeout(() => setProgress(''), 5000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sowText, enableL4L5]);

  const onRevalidate = useCallback(async () => {
    if (!wbs) return;
    const a = await validateWBS(wbs);
    setAudit(a);
  }, [wbs]);

  // ⭐ v3.0: 按需展开单个 L3 为 L4-L5
  const onExpandL3 = useCallback(async (l3Node, fullSowTextFromTree, llmConfigFromTree) => {
    if (!l3Node || !l3Node.code) return;
    const l3Key = l3Node.code;
    if (expandingL3 === l3Key) return; // 防止重复点击
    setExpandingL3(l3Key);
    setError('');
    setProgress(`🤖 正在按需展开 ${l3Key} "${l3Node.name}" → L4-L5…`);
    try {
      const ctx = fullSowTextFromTree || sowText;
      const cfgToUse = llmConfigFromTree || cfg;
      const { l3: expandedL3, log: expandLog, meta } = await expandL3(
        {
          code: l3Node.code,
          name: l3Node.name,
          estimatedHours: l3Node.estimatedHours,
          owner: l3Node.owner,
          deliverable: l3Node.deliverable,
          sowEvidence: l3Node.sowEvidence,
        },
        { sowText: ctx, llmConfig: cfgToUse }
      );
      // 合并 children 到原 wbs 树
      setWbs((prev) => {
        if (!prev) return prev;
        const cloned = JSON.parse(JSON.stringify(prev));
        const apply = (nodes) => {
          for (const n of nodes) {
            if (n.code === l3Key) {
              n.children = expandedL3.children || [];
              n.estimatedHours = (expandedL3.children || []).reduce(
                (s, c) => s + (c.estimatedHours || 0),
                0,
              );
              return true;
            }
            if (n.children?.length && apply(n.children)) return true;
          }
          return false;
        };
        apply(cloned.wbs || []);
        return cloned;
      });
      // 合并日志
      if (expandLog?.length) {
        setLog((prev) => [...(prev || []), ...expandLog]);
      }
      const count = expandedL3.children?.length || 0;
      const desc = `${count} 个 L4`;
      setProgress(`✅ ${l3Key} 已展开为 ${desc}${meta?.elapsedMs ? ` (${meta.elapsedMs}ms)` : ''}`);
      setTimeout(() => setProgress(''), 3000);
      if (typeof window !== 'undefined' && window.__wbs__) window.__wbs__ = { ...window.__wbs__ };
    } catch (e) {
      setError(`展开 ${l3Key} 失败：${e.message}`);
      setProgress('');
    } finally {
      setExpandingL3(null);
    }
  }, [expandingL3, sowText, cfg]);

  const onExport = useCallback(
    async (format) => {
      if (!wbs) return;
      try {
        await exportFile(format, wbs);
      } catch (e) {
        setError(e.message);
      }
    },
    [wbs],
  );

  const sample = `【SOW 样例】客户流水分析智能体

1. 项目背景
海门农商行客户经理日常需人工分析客户银行流水，工作量大、效率低、易出错。
需建设客户流水分析智能体，自动识别流水真伪、归类收支、识别风险。

2. 业务目标
- 支持 6 大问询场景：综合分析、完整性检测、PS篡改/拆分冲账识别、过桥拆借识别、偿债能力测算、异常时段筛查
- 准确率 ≥ 95%
- 单笔响应 ≤ 3s，批量 ≤ 10s
- 节省人工 3 人/月

3. 数据范围
- 公私账户流水
- 微信/支付宝流水
- 截图、PDF、纸质三类 OCR 多模态输入

4. 技术要求
- 基于行内大模型 + Agent 框架
- 支持 PS 篡改检测
- 支持 RAG 索引全量流水
- 性能 SLA：并发 300

5. 交付要求
- 18 周交付，分 4 个 Sprint 迭代 + 上线
- 使用规模 131 名客户经理`;

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b flex-shrink-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-md flex items-center justify-center text-white font-bold">
              W
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">SOW → WBS 工作分解系统</h1>
              <div className="text-xs text-slate-500">基于 WBS Master Prompt v2.3 · 敏捷瀑布混合</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs px-2 py-1"
              onClick={resetLayout}
              title="重置左/中/右三栏宽度为默认比例（左=18%，中=28%）"
            >
              ↔️ 重置布局
            </button>
            {cfg.apiKey ? (
              <span className="badge bg-emerald-100 text-emerald-700">
                {cfg.provider} · {cfg.model}
              </span>
            ) : systemDefault && systemDefault.apiKeyPresent ? (
              <span
                className="badge bg-emerald-50 text-emerald-700 border border-emerald-200"
                title={`未配个人 API Key，将使用系统兜底：${systemDefault.label} (${systemDefault.model})`}
              >
                🛡️ 兜底 {systemDefault.model}
              </span>
            ) : (
              <span className="badge bg-amber-100 text-amber-700">未配置 AI</span>
            )}
            <button className="btn-secondary" onClick={() => setShowConfig(true)}>
              ⚙️ AI 配置
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-3 overflow-hidden">
        <div
          ref={containerRef}
          className="flex h-full w-full gap-0"
          style={{ minHeight: 0 }}
        >
          {/* 左：控制台（可滚动） */}
          <section
            className="overflow-y-auto pr-1 space-y-3 pb-2 flex-shrink-0"
            style={{ width: `${leftColWidth}px`, minWidth: 0 }}
          >
            <div className="card p-3">
              <h2 className="font-semibold mb-2 text-sm">📥 第 1 步：导入 SOW</h2>
              <label className="block border-2 border-dashed border-slate-300 rounded-lg p-3 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/30 transition-colors">
                <input
                  type="file"
                  className="hidden"
                  accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <div className="text-2xl mb-1">📄</div>
                <div className="text-sm text-slate-700 font-medium">点击上传 / 拖入文件</div>
                <div className="text-[10px] text-slate-400 mt-0.5">.docx / .pdf / .txt / .md · 最大 20MB</div>
              </label>

              {sowMeta && (
                <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                  <span className="truncate">
                    📎 {sowMeta.filename} · {sowMeta.chars.toLocaleString()} 字
                    {sowMeta.pdfPages && ` · ${sowMeta.pdfPages} 页`}
                  </span>
                  <button
                    className="text-brand-600 hover:underline ml-2 shrink-0"
                    onClick={() => {
                      setSowText('');
                      setSowMeta(null);
                      setSowFile(null);
                    }}
                  >
                    清空
                  </button>
                </div>
              )}

              <div className="mt-3">
                <div className="text-xs text-slate-500 mb-1">或直接粘贴 / 编辑文本：</div>
                <textarea
                  className="input font-mono text-xs"
                  value={sowText}
                  onChange={(e) => {
                    setSowText(e.target.value);
                    setHighlightText('');
                  }}
                  placeholder="将 SOW 内容粘贴到此处..."
                  rows={3}
                />
                <button
                  className="text-xs text-brand-600 hover:underline mt-1"
                  onClick={() => setSowText(sample)}
                >
                  📝 加载样例 SOW（海门农商行）
                </button>
              </div>
            </div>

            <div className="card p-3">
              <h2 className="font-semibold mb-2 text-sm">🤖 第 2 步：生成 WBS</h2>

              {/* ⭐ 分解粒度选项 - 紧凑版 */}
              <div className="mb-2 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-[11px] font-semibold text-slate-600 mb-1">📐 分解粒度</div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="wbs-depth"
                      checked={enableL4L5 === true}
                      onChange={() => setEnableL4L5(true)}
                      disabled={loading}
                      className="cursor-pointer"
                    />
                    <span className="text-xs text-slate-800">
                      🌲 L1-L5 <span className="text-[10px] text-brand-600">[推荐]</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="wbs-depth"
                      checked={enableL4L5 === false}
                      onChange={() => setEnableL4L5(false)}
                      disabled={loading}
                      className="cursor-pointer"
                    />
                    <span className="text-xs text-slate-800">
                      📋 L1-L3 <span className="text-[10px] text-emerald-600">[按需展开]</span>
                    </span>
                  </label>
                </div>
              </div>

              <button
                className="btn-primary w-full justify-center text-sm py-1.5"
                onClick={onGenerate}
                disabled={loading || !sowText.trim()}
              >
                {loading ? '⏳ 生成中…' : enableL4L5 ? '🚀 开始生成 WBS (L1-L5)' : '⚡ 开始生成 WBS (L1-L3 骨架,点击 L3 按需展开)'}
              </button>
              <button
                className="btn-secondary w-full justify-center mt-1.5 text-xs py-1"
                onClick={onMockGenerate}
                disabled={loading}
                title="不调用真实 LLM，仅演示日志面板与导出按钮"
              >
                🧪 模拟测试日志（不消耗 API）
              </button>
              {progress && (
                <div className="mt-2 text-xs text-slate-600 bg-slate-50 px-2 py-1.5 rounded">{progress}</div>
              )}
              {error && (
                <div className="mt-2 text-xs text-red-700 bg-red-50 px-2 py-1.5 rounded whitespace-pre-wrap">
                  ❌ {error}
                </div>
              )}
            </div>

            <LogPanel log={log} />

            {wbs && (
              <div className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold text-sm">📤 第 3 步：导出</h2>
                  <button className="btn-ghost text-xs px-2 py-0.5" onClick={onRevalidate}>
                    🔄 重新校验
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onExport('xlsx')}>
                    📊 Excel
                  </button>
                  <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onExport('md')}>
                    📝 MD
                  </button>
                  <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onExport('docx')}>
                    📄 Word
                  </button>
                  <button className="btn-secondary text-xs px-2 py-1.5 justify-center" onClick={() => onExport('json')}>
                    {} JSON
                  </button>
                </div>
              </div>
            )}

            {wbs && <MetaPanel wbs={wbs} audit={audit} />}
          </section>

          {/* ⭐ v2.18: 第 0 个可拖拽分隔条（左-中） */}
          <ResizeHandle
            onResize={setLeftColWidth}
            onReset={() => setLeftColWidth(280)}
            defaultRatio={0.2}
            containerWidth={containerWidth - middleColWidth - 360}
          />

          {/* 中：SOW 文档预览面板 */}
          <section
            className="flex flex-col h-full overflow-hidden flex-shrink-0 ml-2"
            style={{ width: `${middleColWidth}px`, minWidth: 0 }}
          >
            <div className="mb-2 flex items-center justify-between flex-shrink-0 px-1">
              <h2 className="font-semibold text-sm">📄 SOW 文档预览</h2>
              {highlightText && (
                <button
                  onClick={() => setHighlightText('')}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  ✕ 清除高亮
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <SOWPreview
                file={sowFile}
                text={sowText}
                highlightText={highlightText}
                paragraphs={sowParagraphs}
              />
            </div>
          </section>

          {/* ⭐ v2.18: 第 1 个可拖拽分隔条（中-右） */}
          <ResizeHandle
            onResize={setMiddleColWidth}
            onReset={() => setMiddleColWidth(420)}
            defaultRatio={0.3}
            containerWidth={containerWidth - leftColWidth - 360}
          />

          {/* 右：WBS 树 */}
          <section
            className="flex flex-col h-full overflow-hidden flex-1 min-w-0 ml-2"
          >
            <div className="card p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <h2 className="font-semibold text-sm">🌲 WBS 树</h2>
                {wbs && <WbsStats wbs={wbs} />}
              </div>

              {!wbs ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <div className="text-5xl mb-3">🌳</div>
                  <div className="text-sm">导入 SOW 后，点击"开始生成 WBS"</div>
                  <div className="text-xs mt-2 text-slate-400 text-center max-w-xs">
                    生成后可点击 WBS 节点中的 🔗 证据
                    <br />定位到 SOW 文档对应位置
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 border border-slate-200 rounded-md bg-slate-50/30">
                  <WBSTree
                    wbs={wbs}
                    onLocateInSow={onLocateInSow}
                    onExpandL3={onExpandL3}
                    expandingL3={expandingL3}
                    fullSowText={sowText}
                    llmConfig={cfg}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {showConfig && (
        <AIConfig
          onClose={() => setShowConfig(false)}
          onSaved={() => window.location.reload()}
        />
      )}

      <footer className="text-center text-xs text-slate-400 py-2 flex-shrink-0 border-t bg-white">
        SOW→WBS System · 基于 PMO WBS Master Prompt v2.3 · 工时守恒 + 命名规范自动校验
      </footer>
    </div>
  );
}