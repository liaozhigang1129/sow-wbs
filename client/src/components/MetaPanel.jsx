// Meta & 风险信息展示
import React from 'react';

const RISK_COLORS = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-green-100 text-green-700',
};

export default function MetaPanel({ wbs, audit }) {
  if (!wbs) return null;
  const meta = wbs.meta || {};

  return (
    <div className="space-y-3">
      {audit?.parseWarning && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <h3 className="font-semibold mb-1 flex items-center gap-2 text-amber-800">
            ⚠️ JSON 解析警告
          </h3>
          <div className="text-sm text-amber-700">{audit.parseWarning}</div>
          <div className="text-xs text-amber-600 mt-1">
            建议：① 换更大输出窗口的模型（如 Claude Sonnet 4.5 / GPT-4o）② 精简 SOW 内容 ③ 在 AI 配置中调整 max_tokens
          </div>
        </div>
      )}
      {audit?.truncated && !audit?.parseWarning && (
        <div className="card p-4 border-amber-300 bg-amber-50">
          <h3 className="font-semibold mb-1 flex items-center gap-2 text-amber-800">
            ⚠️ 模型输出可能不完整
          </h3>
          <div className="text-sm text-amber-700">
            检测到 finish_reason=length，建议使用支持更大输出的模型。
          </div>
        </div>
      )}
      {meta && Object.keys(meta).length > 0 && (
        <div className="card p-3">
          <h3 className="font-semibold mb-3 flex items-center gap-2">📋 项目概览</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {meta.project && (
              <div>
                <div className="text-xs text-slate-500">项目</div>
                <div className="font-medium">{meta.project}</div>
              </div>
            )}
            {meta.client && (
              <div>
                <div className="text-xs text-slate-500">客��</div>
                <div className="font-medium">{meta.client}</div>
              </div>
            )}
            {meta.industry && (
              <div className="col-span-2">
                <div className="text-xs text-slate-500">行业识别</div>
                <div className="font-medium">{meta.industry}</div>
                {Array.isArray(meta.industryEvidence) && meta.industryEvidence.length > 0 && (
                  <ul className="mt-1 text-xs text-slate-600 list-disc list-inside">
                    {meta.industryEvidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {meta.totalWeeks && (
              <div>
                <div className="text-xs text-slate-500">总工期</div>
                <div className="font-medium">{meta.totalWeeks} 周</div>
              </div>
            )}
            {meta.governance && (
              <div>
                <div className="text-xs text-slate-500">治理模式</div>
                <div className="font-medium">{meta.governance}</div>
              </div>
            )}
            {meta.teamSize && (
              <div className="col-span-2">
                <div className="text-xs text-slate-500">团队规模</div>
                <div className="font-medium">{meta.teamSize}</div>
              </div>
            )}
          </div>
          {meta.levelStats && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-xs text-slate-500 mb-1">层级统计</div>
              <div className="flex flex-wrap gap-2 text-xs">
                {meta.levelStats.L1_milestones !== undefined && (
                  <span className="badge bg-brand-100 text-brand-700">L1 里程碑 {meta.levelStats.L1_milestones}</span>
                )}
                {meta.levelStats.L2_wps !== undefined && (
                  <span className="badge bg-slate-100 text-slate-700">L2 WP {meta.levelStats.L2_wps}</span>
                )}
                {meta.levelStats.L3_activities !== undefined && (
                  <span className="badge bg-slate-100 text-slate-700">L3 Activity {meta.levelStats.L3_activities}</span>
                )}
                {meta.levelStats.L4_tasks !== undefined && (
                  <span className="badge bg-slate-100 text-slate-700">L4 Task {meta.levelStats.L4_tasks}</span>
                )}
                {meta.levelStats.L5_subtasks !== undefined && (
                  <span className="badge bg-slate-100 text-slate-700">L5 SubTask {meta.levelStats.L5_subtasks}</span>
                )}
                {meta.levelStats.totalHours !== undefined && (
                  <span className="badge bg-emerald-100 text-emerald-700">
                    总工时 {meta.levelStats.totalHours}h
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {audit && (
        <div className={`card p-4 ${audit.passed ? 'border-emerald-200' : 'border-amber-200'}`}>
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            {audit.passed ? '✅' : '⚠️'} 校验结果
          </h3>
          <div className="text-sm text-slate-600">
            节点 {audit.stats?.total || 0} 个，总工时 {audit.stats?.totalHours || 0}h
          </div>
          {audit.errors?.length > 0 ? (
            <ul className="mt-2 text-xs text-amber-700 space-y-1 max-h-40 overflow-y-auto">
              {audit.errors.slice(0, 20).map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
              {audit.errors.length > 20 && <li>... 等共 {audit.errors.length} 个</li>}
            </ul>
          ) : (
            <div className="text-xs text-emerald-600 mt-1">工时守恒 + 命名规范 全部合规</div>
          )}
          {audit.fixed && <div className="text-xs text-blue-600 mt-1">🔧 已自动修复一次</div>}
        </div>
      )}

      {Array.isArray(wbs.risks) && wbs.risks.length > 0 && (
        <div className="card p-3">
          <h3 className="font-semibold mb-3 flex items-center gap-2">⚡ 风险列表 ({wbs.risks.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {wbs.risks.map((r, i) => (
              <div key={i} className="border-l-2 border-slate-200 pl-3 py-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${RISK_COLORS[r.level] || 'bg-slate-100 text-slate-700'}`}>
                    {r.level}
                  </span>
                  <span className="badge bg-slate-100 text-slate-700">{r.category}</span>
                  <span className="text-xs text-slate-500">P={r.p} I={r.i}</span>
                </div>
                <div className="text-sm text-slate-800 mt-0.5">{r.description}</div>
                {r.evidence && <div className="text-xs text-slate-500">证据：{r.evidence}</div>}
                {r.mitigation && <div className="text-xs text-emerald-600">缓释：{r.mitigation}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(wbs.clarifications) && wbs.clarifications.length > 0 && (
        <div className="card p-4 border-amber-200">
          <h3 className="font-semibold mb-2 flex items-center gap-2">❓ 待澄清项 ({wbs.clarifications.length})</h3>
          <ul className="text-sm text-slate-700 list-disc list-inside space-y-1">
            {wbs.clarifications.map((c, i) => (
              <li key={i}>{typeof c === 'string' ? c : JSON.stringify(c)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}