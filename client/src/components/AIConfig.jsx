// AI 配置面板
import React, { useState } from 'react';
import { loadConfig, saveConfig, PROVIDER_PRESETS } from '../utils/config.js';
import { testLLM } from '../utils/api.js';

export default function AIConfig({ onClose, onSaved }) {
  const [cfg, setCfg] = useState(loadConfig());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const update = (k, v) => {
    setCfg((c) => ({ ...c, [k]: v }));
    // 修改配置后清空旧结果
    if (testResult) setTestResult(null);
  };

  const onProviderChange = (p) => {
    const preset = PROVIDER_PRESETS[p];
    setCfg((c) => ({
      ...c,
      provider: p,
      baseUrl: preset.baseUrl,
      model: preset.models[0],
    }));
    setTestResult(null);
  };

  const save = () => {
    saveConfig(cfg);
    onSaved?.(cfg);
    onClose?.();
  };

  const onTest = async () => {
    if (!cfg.apiKey) {
      setTestResult({ ok: false, message: '请先填写 API Key', latencyMs: 0 });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testLLM(cfg);
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, message: e.message, latencyMs: 0 });
    } finally {
      setTesting(false);
    }
  };

  const preset = PROVIDER_PRESETS[cfg.provider];

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">⚙️ AI 模型配置</h3>
          <button className="btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label">模型厂商</label>
            <select
              className="input"
              value={cfg.provider}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              {Object.entries(PROVIDER_PRESETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Base URL</label>
            <input
              className="input"
              value={cfg.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              placeholder="https://api.openai.com"
            />
            <div className="text-xs text-slate-400 mt-1">
              OpenAI 兼容：路径自动补 <code>/v1/chat/completions</code>。Claude：补 <code>/v1/messages</code>。
            </div>
          </div>
          <div>
            <label className="label">Model</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={cfg.model}
                onChange={(e) => update('model', e.target.value)}
              />
              <select
                className="input w-32"
                onChange={(e) => update('model', e.target.value)}
                value={preset.models.includes(cfg.model) ? cfg.model : ''}
              >
                <option value="">预设...</option>
                {preset.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">API Key</label>
            <input
              className="input"
              type="password"
              value={cfg.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
            />
            <div className="text-xs text-slate-400 mt-1">
              仅保存在浏览器 localStorage，不上传服务器。
            </div>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
              ⚙️ 高级设置
            </summary>
            <div className="mt-2 space-y-3 pl-2 border-l-2 border-slate-200">
              <div>
                <label className="label">最大输出 Token</label>
                <input
                  className="input"
                  type="number"
                  min={1024}
                  max={128000}
                  step={1024}
                  value={cfg.maxTokens || 16000}
                  onChange={(e) => update('maxTokens', Number(e.target.value) || 16000)}
                />
                <div className="text-xs text-slate-400 mt-1">
                  大型 WBS（6+ 里程碑 + 多层子节点）建议 ≥16000（OpenAI）/ ≥20000（Claude）。
                  若经常被截断，可逐步调高。
                </div>
              </div>
            </div>
          </details>

          {/* 测试连接区 */}
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary"
                onClick={onTest}
                disabled={testing || !cfg.apiKey}
              >
                {testing ? '⏳ 测试中…' : '🔌 测试连接'}
              </button>
              <span className="text-xs text-slate-400">
                发送最小请求验证 API Key + Model 是否可用
              </span>
            </div>

            {testResult && (
              <div
                className={`mt-2 px-3 py-2 rounded text-sm ${
                  testResult.ok
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {testResult.ok ? '✅' : '❌'} {testResult.message}
                  {testResult.latencyMs > 0 && (
                    <span className="text-xs opacity-70">({testResult.latencyMs}ms)</span>
                  )}
                </div>
                {testResult.ok && testResult.model && (
                  <div className="text-xs mt-1 opacity-80">
                    模型：<span className="font-mono">{testResult.model}</span>
                    {testResult.echo && (
                      <>
                        {' '}
                        · 回显：<span className="font-mono">{testResult.echo}</span>
                      </>
                    )}
                  </div>
                )}
                {!testResult.ok && (
                  <div className="text-xs mt-1 break-all opacity-80">{testResult.message}</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t bg-slate-50 rounded-b-lg flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={save} disabled={testing}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}