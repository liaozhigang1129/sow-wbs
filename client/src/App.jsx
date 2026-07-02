import React, { useState, useCallback, useMemo, useRef } from 'react';
import WBSTree from './components/WBSTree.jsx';
import MetaPanel from './components/MetaPanel.jsx';
import AIConfig from './components/AIConfig.jsx';
import LogPanel from './components/LogPanel.jsx';
import SOWPreview from './components/SOWPreview.jsx';
import { uploadSOW, generateWBS, mockGenerate, validateWBS, exportFile } from './utils/api.js';
import { loadConfig } from './utils/config.js';

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
    if (!cfg.apiKey) {
      setError('请先配置 API Key（点击右上角 ⚙️）');
      setShowConfig(true);
      return;
    }
    setLoading(true);
    setError('');
    setLog([]);
    setMeta(null);
    setProgress('🤖 AI 正在生成 WBS（可能需要 1-3 分钟）…');
    try {
      const { wbs: w, audit: a, log: l, meta: m } = await generateWBS(sowText, cfg);
      setWbs(w);
      setAudit(a);
      setLog(l || []);
      setMeta(m || null);
      // ⭐ 调试用：在浏览器 DevTools Console 可访问 window.__wbs__
      if (typeof window !== 'undefined') window.__wbs__ = w;
      const tip = a.parseWarning
        ? `⚠️ 生成完成（${a.parseMethod}）`
        : a.passed
        ? `✅ 生成完成 + 校验通过（${a.parseMethod}）`
        : `⚠️ 生成完成，但有 ${a.errors.length} 个校验问题（${a.parseMethod}）`;
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
  }, [sowText, cfg]);

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
      const { wbs: w, log: l } = await mockGenerate(sowText || '【模拟 SOW】行内信贷智能体建设项目');
      setWbs(w);
      setLog(l || []);
      setProgress('✅ 模拟生成完成（不消耗 API）');
      setTimeout(() => setProgress(''), 5000);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sowText]);

  const onRevalidate = useCallback(async () => {
    if (!wbs) return;
    const a = await validateWBS(wbs);
    setAudit(a);
  }, [wbs]);

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
    <div className="min-h-screen">
      <header className="bg-white border-b sticky top-0 z-10">
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
            {cfg.apiKey ? (
              <span className="badge bg-emerald-100 text-emerald-700">
                {cfg.provider} · {cfg.model}
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

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左：输入区 + 生成控制 */}
          <section className="lg:col-span-3 space-y-4">
            <div className="card p-4">
              <h2 className="font-semibold mb-3">📥 第 1 步：导入 SOW</h2>
              <label className="block border-2 border-dashed border-slate-300 rounded-lg p-5 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/30 transition-colors">
                <input
                  type="file"
                  className="hidden"
                  accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <div className="text-3xl mb-1">📄</div>
                <div className="text-sm text-slate-700 font-medium">点击上传 .docx / .pdf / .txt / .md</div>
                <div className="text-xs text-slate-400 mt-1">最大 20MB</div>
              </label>

              {sowMeta && (
                <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                  <span>
                    📎 {sowMeta.filename} · {sowMeta.chars.toLocaleString()} 字符
                    {sowMeta.pdfPages && ` · ${sowMeta.pdfPages} 页`}
                    {sowMeta.tableRows > 0 && (
                      <span className="badge bg-emerald-100 text-emerald-700 ml-1">
                        📊 {Math.ceil(sowMeta.tableRows / 2)} 个表格
                      </span>
                    )}
                  </span>
                  <button
                    className="text-brand-600 hover:underline"
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
                  rows={6}
                  value={sowText}
                  onChange={(e) => {
                    setSowText(e.target.value);
                    setHighlightText('');
                  }}
                  placeholder="将 SOW 内容粘贴到此处..."
                />
                <button
                  className="text-xs text-brand-600 hover:underline mt-1"
                  onClick={() => setSowText(sample)}
                >
                  📝 加载样例 SOW（海门农商行）
                </button>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="font-semibold mb-3">🤖 第 2 步：生成 WBS</h2>
              <button
                className="btn-primary w-full justify-center"
                onClick={onGenerate}
                disabled={loading || !sowText.trim()}
              >
                {loading ? '⏳ 生成中…' : '🚀 开始生成 WBS'}
              </button>
              <button
                className="btn-secondary w-full justify-center mt-2"
                onClick={onMockGenerate}
                disabled={loading}
                title="不调用真实 LLM，仅演示日志面板与导出按钮"
              >
                🧪 模拟测试日志（不消耗 API）
              </button>
              {progress && (
                <div className="mt-3 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded">{progress}</div>
              )}
              {error && (
                <div className="mt-3 text-sm text-red-700 bg-red-50 px-3 py-2 rounded whitespace-pre-wrap">
                  ❌ {error}
                </div>
              )}
            </div>

            <LogPanel log={log} />

            {wbs && (
              <div className="card p-4">
                <h2 className="font-semibold mb-3">📤 第 3 步：导出</h2>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary" onClick={() => onExport('xlsx')}>
                    📊 Excel
                  </button>
                  <button className="btn-secondary" onClick={() => onExport('md')}>
                    📝 Markdown
                  </button>
                  <button className="btn-secondary" onClick={() => onExport('docx')}>
                    📄 Word
                  </button>
                  <button className="btn-secondary" onClick={() => onExport('json')}>
                    { } JSON
                  </button>
                </div>
                <button className="btn-ghost w-full justify-center mt-2" onClick={onRevalidate}>
                  🔄 重新校验
                </button>
              </div>
            )}

            {wbs && <MetaPanel wbs={wbs} audit={audit} />}
          </section>

          {/* 中：SOW 文档预览面板 */}
          <section className="lg:col-span-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">📄 SOW 文档预览</h2>
              {highlightText && (
                <button
                  onClick={() => setHighlightText('')}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  ✕ 清除高亮
                </button>
              )}
            </div>
            <div style={{ height: 'calc(100vh - 220px)', minHeight: '600px' }}>
              <SOWPreview
                file={sowFile}
                text={sowText}
                highlightText={highlightText}
                paragraphs={sowParagraphs}
              />
            </div>
          </section>

          {/* 右：WBS 树 */}
          <section className="lg:col-span-4">
            <div className="card p-4 min-h-[600px]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">🌲 WBS 树</h2>
                {wbs && <WbsStats wbs={wbs} />}
              </div>

              {!wbs ? (
                <div className="text-center text-slate-400 py-20">
                  <div className="text-5xl mb-3">🌳</div>
                  <div>导入 SOW 后，点击"开始生成 WBS"</div>
                  <div className="text-xs mt-2 text-slate-400">
                    生成后可点击 WBS 节点中的 🔗 证据
                    <br />定位到 SOW 文档对应位置
                  </div>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-2">
                  <WBSTree wbs={wbs} onLocateInSow={onLocateInSow} />
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

      <footer className="text-center text-xs text-slate-400 py-6">
        SOW→WBS System · 基于 PMO WBS Master Prompt v2.3 · 工时守恒 + 命名规范自动校验
      </footer>
    </div>
  );
}