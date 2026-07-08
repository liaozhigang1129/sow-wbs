// 生成流程日志面板（带彩色徽章 + 一键导出 + 级别筛选）
import React, { useMemo, useState } from 'react';

const LEVEL_STYLE = {
  info: { text: 'text-blue-200', icon: 'ℹ️', badge: 'bg-blue-500/20 text-blue-200 border-blue-400/40' },
  warn: { text: 'text-amber-200', icon: '⚠️', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  error: { text: 'text-red-200', icon: '❌', badge: 'bg-red-500/20 text-red-200 border-red-400/40' },
};

const STAGE_COLORS = {
  start: 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40',
  prompt: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  input: 'bg-slate-500/20 text-slate-200 border-slate-400/40',
  call: 'bg-violet-500/20 text-violet-200 border-violet-400/40',
  retry: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  truncated: 'bg-orange-500/20 text-orange-200 border-orange-400/40',
  extract: 'bg-pink-500/20 text-pink-200 border-pink-400/40',
  repair: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  parse: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40',
  validate: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
  enrich: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
  ok: 'bg-green-500/30 text-green-100 border-green-400/60',
  fail: 'bg-red-600/30 text-red-100 border-red-400/60',
};

function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toMarkdown(log) {
  const ts = new Date().toISOString();
  const counts = log.reduce(
    (acc, l) => ((acc[l.level] = (acc[l.level] || 0) + 1), acc),
    {}
  );
  let md = `# WBS 生成流程日志\n\n`;
  md += `- 导出时间：${ts}\n`;
  md += `- 总条数：${log.length}\n`;
  md += `- INFO：${counts.info || 0} | WARN：${counts.warn || 0} | ERROR：${counts.error || 0}\n\n`;
  md += `| # | 时间 | 级别 | 阶段 | 消息 |\n`;
  md += `|---|------|------|------|------|\n`;
  log.forEach((l, i) => {
    const msg = (l.msg || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    md += `| ${i + 1} | ${l.t} | ${(l.level || '').toUpperCase()} | ${l.stage || ''} | ${msg} |\n`;
  });
  md += `\n## 原始 JSON\n\n\`\`\`json\n${JSON.stringify(log, null, 2)}\n\`\`\`\n`;
  return md;
}

function toText(log) {
  return log
    .map((l) => {
      const data = l.data ? ` ${JSON.stringify(l.data)}` : '';
      return `[${l.t}] ${(l.level || '').toUpperCase().padEnd(5)} [${l.stage || ''}] ${l.msg}${data}`;
    })
    .join('\n');
}

export default function LogPanel({ log }) {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState('all'); // all | info | warn | error

  const filtered = useMemo(() => {
    if (filter === 'all') return log;
    return log.filter((l) => l.level === filter);
  }, [log, filter]);

  if (!log || log.length === 0) return null;

  const errors = log.filter((l) => l.level === 'error').length;
  const warns = log.filter((l) => l.level === 'warn').length;
  const infos = log.filter((l) => l.level === 'info').length;

  const handleExport = (fmt) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (fmt === 'md') download(`wbs-log-${ts}.md`, toMarkdown(log), 'text/markdown;charset=utf-8');
    else if (fmt === 'txt') download(`wbs-log-${ts}.txt`, toText(log));
    else if (fmt === 'json') download(`wbs-log-${ts}.json`, JSON.stringify(log, null, 2), 'application/json');
  };

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          className="flex items-center gap-2 font-semibold text-left flex-1 min-w-0 text-sm"
          onClick={() => setOpen(!open)}
        >
          <span>📋 生成流程日志</span>
          <span className="badge bg-slate-700 text-slate-100 border border-slate-500">{log.length} 条</span>
          {infos > 0 && (
            <span className="badge bg-blue-500/30 text-blue-100 border border-blue-400/60">
              ℹ️ {infos}
            </span>
          )}
          {warns > 0 && (
            <span className="badge bg-amber-500/30 text-amber-100 border border-amber-400/60">
              ⚠️ {warns}
            </span>
          )}
          {errors > 0 && (
            <span className="badge bg-red-500/30 text-red-100 border border-red-400/60">
              ❌ {errors}
            </span>
          )}
          <span className="text-slate-400 ml-auto">{open ? '▾' : '▸'}</span>
        </button>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs px-2 py-1 rounded border border-slate-300 bg-white"
            title="按级别筛选"
          >
            <option value="all">全部</option>
            <option value="info">仅 INFO</option>
            <option value="warn">仅 WARN</option>
            <option value="error">仅 ERROR</option>
          </select>
          <button
            type="button"
            onClick={() => handleExport('md')}
            className="text-xs px-2 py-1 rounded bg-slate-700 text-white hover:bg-slate-600 border border-slate-500"
            title="导出为 Markdown（含表格 + JSON）"
          >
            📥 导出日志
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md bg-slate-900 text-slate-100 text-xs font-mono border border-slate-700">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-slate-400">该级别无日志</div>
          )}
          {filtered.map((e, i) => {
            const lv = LEVEL_STYLE[e.level] || LEVEL_STYLE.info;
            const stageClass = STAGE_COLORS[e.stage] || 'bg-slate-600/30 text-slate-200 border-slate-500/40';
            const dataStr = e.data ? JSON.stringify(e.data) : '';
            return (
              <div
                key={i}
                className={`px-3 py-1.5 border-b border-slate-800 hover:bg-slate-800/70 ${
                  e.level === 'error'
                    ? 'bg-red-950/30'
                    : e.level === 'warn'
                    ? 'bg-amber-950/20'
                    : ''
                }`}
              >
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-slate-500 shrink-0 tabular-nums">{e.t}</span>
                  {/* 级别徽章（彩色背景） */}
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${lv.badge}`}
                    title={`level=${e.level}`}
                  >
                    <span>{lv.icon}</span>
                    <span>{(e.level || 'info').toUpperCase()}</span>
                  </span>
                  {/* 阶段徽章（彩色背景） */}
                  <span
                    className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${stageClass}`}
                    title={`stage=${e.stage}`}
                  >
                    {e.stage}
                  </span>
                  <span className="flex-1 break-words min-w-0">{e.msg}</span>
                </div>
                {dataStr && (
                  <div className="ml-2 mt-1 pl-3 border-l-2 border-slate-700 text-slate-400 text-[10px] break-all whitespace-pre-wrap">
                    {dataStr.length > 400 ? dataStr.slice(0, 400) + '…(已截断)' : dataStr}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 text-[11px] text-slate-500">
        提示：点击右上「📥 导出日志」可保存为 Markdown（含表格 + 原始 JSON）供排障使用。
      </div>
    </div>
  );
}