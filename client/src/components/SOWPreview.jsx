// SOW 文档预览面板（v2.18）
// - 支持 PDF（iframe）/ DOCX（docx-preview + 浮动高亮面板）/ TXT/MD（带高亮文本）
// - 新增：面板折叠/展开（节省屏幕空间）
// - 新增：DOCX/PDF 高亮定位面板（基于已解析的纯文本 + 关键词提取）
// - 新增：明显的视觉高亮（黄色背景 + 自动滚动 + 临时聚焦）
// - 新增：文字缩放控件 A-/A/A+（仅 txt/md），DOCX/PDF 用浏览器内置缩放（Ctrl+滚轮亦可）
// - 修复：docx 容器需要 flex 撑满、SOW 预览面板需要明确高度
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { renderAsync as renderDocx } from 'docx-preview';

/**
 * 文档类型检测
 */
function getDocType(file) {
  if (!file) return 'none';
  const name = (file.name || '').toLowerCase();
  const mimetype = (file.mimetype || '').toLowerCase();

  if (name.endsWith('.pdf') || mimetype === 'application/pdf') return 'pdf';
  if (
    name.endsWith('.docx') ||
    mimetype.includes('word') ||
    mimetype.includes('officedocument')
  ) return 'docx';
  if (name.endsWith('.doc')) return 'doc';
  if (name.endsWith('.md') || mimetype === 'text/markdown') return 'md';
  if (name.endsWith('.txt') || mimetype.startsWith('text/')) return 'txt';
  return 'unknown';
}

/**
 * 智能解析 sowEvidence：
 * - 新格式 "X.Y 节｜关键词1、关键词2" → 拆出 [section, ...keywords]
 * - 旧格式 "X.Y 节" → 只返回 [section]
 * - 无章节号纯文本 → 当作关键词数组
 */
function parseSowEvidence(evidence) {
  if (!evidence) return { section: '', keywords: [] };
  const result = { section: '', keywords: [] };
  const parts = evidence.split(/[｜|]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return result;
  const sectionMatch = parts[0].match(/^(\d+(?:\.\d+)*)(?:\s*节)?$/);
  if (sectionMatch) {
    result.section = sectionMatch[1];
    result.keywords = parts.slice(1)
      .join('｜')
      .split(/[、,，;；\s]+/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
  } else {
    result.keywords = evidence.split(/[、,，;；\s]+/).map((k) => k.trim()).filter((k) => k.length >= 2);
  }
  return result;
}

/**
 * 在原文中查找 sowEvidence 的所有出现位置
 */
function findEvidenceContext(text, sowEvidence, contextChars = 60) {
  if (!text || !sowEvidence) return [];
  const { section, keywords } = parseSowEvidence(sowEvidence);
  const results = [];

  const sortedKw = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sortedKw) {
    let searchFrom = 0;
    let count = 0;
    while (count < 3) {
      const idx = text.indexOf(kw, searchFrom);
      if (idx < 0) break;
      const start = Math.max(0, idx - contextChars);
      const end = Math.min(text.length, idx + kw.length + contextChars * 2);
      results.push({
        keyword: kw,
        index: idx,
        before: text.slice(start, idx),
        match: text.slice(idx, idx + kw.length),
        after: text.slice(idx + kw.length, end),
        source: 'keyword',
      });
      searchFrom = idx + kw.length;
      count++;
      if (results.length >= 5) break;
    }
    if (results.length >= 5) break;
  }

  if (results.length === 0 && section) {
    const sectionPattern = new RegExp(`(${section})\\s*[\\.、]?\\s*([^\\n]{0,80})`, 'g');
    let m;
    let count = 0;
    while ((m = sectionPattern.exec(text)) !== null && count < 3) {
      const idx = m.index;
      const kw = m[1];
      const afterSnippet = m[2] || '';
      const start = Math.max(0, idx - contextChars);
      const end = Math.min(text.length, idx + kw.length + afterSnippet.length + 20);
      results.push({
        keyword: `${section} ${afterSnippet.trim().slice(0, 10)}`,
        index: idx,
        before: text.slice(start, idx),
        match: text.slice(idx, idx + kw.length + afterSnippet.length),
        after: text.slice(idx + kw.length + afterSnippet.length, end),
        source: 'section',
      });
      count++;
    }
  }

  if (results.length === 0 && text.length > 0) {
    results.push({
      keyword: '(无定位结果)',
      index: 0,
      before: '',
      match: text.slice(0, 100),
      after: text.slice(100, 200),
      source: 'fallback',
    });
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

function extractHighlightKeywords(sowEvidence) {
  if (!sowEvidence) return '';
  const { keywords } = parseSowEvidence(sowEvidence);
  if (keywords.length > 0) return keywords.join('|');
  return '';
}

// 文字缩放档位（基于根字号倍率）
const FONT_SCALES = [
  { label: 'A-', value: 0.85 },
  { label: 'A', value: 1.0 },
  { label: 'A+', value: 1.2 },
  { label: 'A++', value: 1.5 },
];

/**
 * SOW 文档预览组件
 */
export default function SOWPreview({ file, text, highlightText, paragraphs = [] }) {
  const docType = getDocType(file);
  const textRef = useRef(null);
  const lastHighlightRef = useRef('');

  const [collapsed, setCollapsed] = useState(false);
  // ⭐ v2.18: 文字缩放档位（仅 txt/md 生效）
  const [fontScaleIdx, setFontScaleIdx] = useState(1); // 默认 A
  const fontScale = FONT_SCALES[fontScaleIdx].value;

  const dataUrl = useMemo(() => {
    if (!file?.base64) return '';
    return `data:${file.mimetype};base64,${file.base64}`;
  }, [file]);

  const docxContainerRef = useRef(null);
  const [docxError, setDocxError] = useState('');

  useEffect(() => {
    if (docType !== 'docx' || !file?.base64) return;
    if (!docxContainerRef.current) return;

    setDocxError('');
    try {
      const binary = atob(file.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      docxContainerRef.current.innerHTML = '';
      renderDocx(bytes, docxContainerRef.current, undefined, {
        className: 'docx-preview-content',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        useBase64URL: true,
        renderHeaders: true,
        renderFooters: true,
      }).catch((err) => {
        console.error('[docx-preview]', err);
        setDocxError('Word 文档渲染失败：' + err.message);
      });
    } catch (err) {
      console.error('[docx-preview init]', err);
      setDocxError('Word 文档解析失败：' + err.message);
    }
  }, [file, docType]);

  // 段落级高亮
  useEffect(() => {
    if (docType !== 'docx' || !highlightText || paragraphs.length === 0) return;
    if (!docxContainerRef.current) return;

    const tryHighlight = (attempt = 0) => {
      const container = docxContainerRef.current;
      if (!container) return;
      const paraElements = container.querySelectorAll('.docx-preview-content p');
      if (paraElements.length === 0) {
        if (attempt < 20) setTimeout(() => tryHighlight(attempt + 1), 100);
        return;
      }

      paraElements.forEach((el, i) => {
        el.setAttribute('data-paragraph-idx', i);
        el.style.transition = 'background-color 0.4s';
      });

      const { keywords, section } = parseSowEvidence(highlightText);
      const matchedIdxs = new Set();
      const matchedNotes = [];

      paragraphs.forEach((p) => {
        const text = (p.text || '').trim();
        if (!text) return;
        if (keywords.length > 0 && keywords.some((kw) => text.includes(kw))) {
          matchedIdxs.add(p.idx);
          matchedNotes.push(`[${p.idx}] 关键词命中: ${keywords.find((kw) => text.includes(kw))}`);
          return;
        }
        if (section) {
          const sectionParts = section.split('.');
          for (let i = sectionParts.length; i > 0; i--) {
            const candidate = sectionParts.slice(0, i).join('.');
            const pattern = new RegExp(`^${candidate.replace(/\./g, '\\.')}[\\.\\s、，]?`);
            if (pattern.test(text)) {
              matchedIdxs.add(p.idx);
              matchedNotes.push(`[${p.idx}] 章节号降级命中: '${candidate}' (原 '${section}')`);
              break;
            }
          }
        }
      });

      if (matchedNotes.length > 0) {
        console.log('[SOWPreview 段落定位]', { sowEvidence: highlightText, section, keywords, matches: matchedNotes });
      }

      let firstMatched = null;
      paraElements.forEach((el) => {
        const idx = parseInt(el.getAttribute('data-paragraph-idx') || '-1', 10);
        if (matchedIdxs.has(idx)) {
          el.style.backgroundColor = 'rgba(252, 211, 77, 0.35)';
          el.style.boxShadow = '0 0 0 4px rgba(252, 211, 77, 0.6)';
          if (!firstMatched) firstMatched = el;
        } else {
          el.style.backgroundColor = '';
          el.style.boxShadow = '';
        }
      });

      if (firstMatched) {
        setTimeout(() => {
          firstMatched.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    };

    setTimeout(() => tryHighlight(0), 200);
  }, [highlightText, docType, paragraphs, file]);

  // txt/md 高亮
  useEffect(() => {
    if (!highlightText || !textRef.current) return;
    if (docType === 'pdf' || docType === 'docx') return;
    if (lastHighlightRef.current === highlightText) return;
    lastHighlightRef.current = highlightText;

    setTimeout(() => {
      const markEl = textRef.current?.querySelector('mark[data-active="true"]');
      if (markEl) {
        markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        markEl.classList.add('ring-4', 'ring-amber-500');
        setTimeout(() => {
          markEl.classList.remove('ring-4', 'ring-amber-500');
        }, 2500);
      }
    }, 80);
  }, [highlightText, docType]);

  const evidenceContexts = useMemo(() => {
    if (
      (docType === 'docx' || docType === 'doc' || docType === 'pdf') &&
      highlightText &&
      text
    ) {
      return findEvidenceContext(text, highlightText, 80);
    }
    return [];
  }, [text, highlightText, docType]);

  // ⭐ 渲染带高亮的文本（应用 fontScale）
  const renderHighlightedText = () => {
    const baseStyle = {
      fontSize: `${12 * fontScale}px`, // 原 css 是 text-xs (12px) 为基准
      lineHeight: 1.6,
    };

    if (!text) {
      return <div className="text-slate-400 italic p-4">无文本内容</div>;
    }
    if (!highlightText) {
      return <div className="whitespace-pre-wrap break-words" style={baseStyle}>{text}</div>;
    }

    const highlightKw = extractHighlightKeywords(highlightText);
    if (!highlightKw) {
      const escaped = highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escaped})`, 'gi');
      const parts = text.split(regex);
      return (
        <div className="whitespace-pre-wrap break-words" style={baseStyle}>
          {parts.map((part, i) => {
            const isMatch = part.toLowerCase() === highlightText.toLowerCase();
            if (isMatch) {
              return (
                <mark
                  key={i}
                  data-active="true"
                  className="bg-yellow-300 text-slate-900 px-0.5 rounded font-semibold shadow-sm"
                  style={{
                    boxShadow:
                      '0 0 0 2px rgba(252, 211, 77, 0.8), 0 0 12px rgba(252, 211, 77, 0.4)',
                  }}
                >
                  {part}
                </mark>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      );
    }

    const kwList = highlightKw.split('|').filter(Boolean);
    const escapedList = kwList.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    escapedList.sort((a, b) => b.length - a.length);
    const combinedRegex = new RegExp(`(${escapedList.join('|')})`, 'gi');
    const parts = text.split(combinedRegex);

    return (
      <div className="whitespace-pre-wrap break-words" style={baseStyle}>
        {parts.map((part, i) => {
          const matched = kwList.some(
            (k) => k.toLowerCase() === part.toLowerCase()
          );
          if (matched) {
            return (
              <mark
                key={i}
                data-active="true"
                className="bg-yellow-300 text-slate-900 px-0.5 rounded font-semibold shadow-sm"
                style={{
                  boxShadow:
                    '0 0 0 2px rgba(252, 211, 77, 0.8), 0 0 12px rgba(252, 211, 77, 0.4)',
                }}
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  // 缩放控件（仅 txt/md 显示）
  const FontScaleControl = () => (
    <div className="flex items-center gap-0.5 border border-slate-200 rounded-md overflow-hidden">
      {FONT_SCALES.map((s, i) => (
        <button
          key={s.label}
          onClick={() => setFontScaleIdx(i)}
          disabled={docType !== 'txt' && docType !== 'md' && docType !== 'unknown'}
          className={`px-1.5 py-0.5 text-[11px] font-mono transition-colors ${
            i === fontScaleIdx
              ? 'bg-brand-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-100'
          } ${(docType !== 'txt' && docType !== 'md' && docType !== 'unknown') ? 'opacity-40 cursor-not-allowed' : ''}`}
          title={
            docType === 'txt' || docType === 'md' || docType === 'unknown'
              ? `缩放档位 ${s.label} (${Math.round(s.value * 100)}%)`
              : '仅文本类文档支持缩放，PDF/Word 请用 Ctrl+滚轮'
          }
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  // 无文件
  if (!file) {
    return (
      <div className="card p-4 h-full flex flex-col items-center justify-center min-h-0 overflow-hidden">
        <div className="text-center text-slate-400">
          <div className="text-5xl mb-3">📄</div>
          <div className="text-sm">尚未上传 SOW 文档</div>
          <div className="text-xs mt-1">上传文件后将在此预览</div>
        </div>
      </div>
    );
  }

  // 折叠态
  if (collapsed) {
    return (
      <div className="card p-0 h-full flex flex-col overflow-hidden min-h-0">
        <div
          className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
          onClick={() => setCollapsed(false)}
          title="点击展开预览面板"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-base">
              {docType === 'pdf'
                ? '📕'
                : docType === 'docx' || docType === 'doc'
                ? '📘'
                : docType === 'md'
                ? '📝'
                : '📄'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-700 truncate" title={file.name}>
                {file.name}
              </div>
              <div className="text-[10px] text-slate-500">
                {(file.size / 1024).toFixed(1)} KB · {docType.toUpperCase()}
                {highlightText && (
                  <span className="ml-1 text-amber-600 font-semibold">
                    · 🔍 {evidenceContexts.length || 1} 处定位
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(false);
            }}
          >
            ▾ 展开
          </button>
        </div>
        {highlightText && evidenceContexts.length > 0 && (
          <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0">
            <div className="text-[10px] font-semibold text-amber-800 mb-1">🔍 证据上下文</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {evidenceContexts.slice(0, 2).map((ctx, i) => (
                <div key={i} className="text-[10px] text-slate-700 leading-relaxed">
                  <span className="text-slate-500">…{ctx.before}</span>
                  <mark className="bg-yellow-300 px-0.5 rounded font-semibold">
                    {ctx.match}
                  </mark>
                  <span className="text-slate-500">{ctx.after}…</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 展开态：完整预览
  return (
    <div className="card p-0 h-full flex flex-col overflow-hidden min-h-0">
      {/* 文档头部 */}
      <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">
            {docType === 'pdf'
              ? '📕'
              : docType === 'docx' || docType === 'doc'
              ? '📘'
              : docType === 'md'
              ? '📝'
              : '📄'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 truncate" title={file.name}>
              {file.name}
            </div>
            <div className="text-[10px] text-slate-500">
              {(file.size / 1024).toFixed(1)} KB · {docType.toUpperCase()}
              {highlightText && (
                <span className="ml-2 text-amber-600 font-semibold animate-pulse">
                  · 🔍 定位中
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* ⭐ 文字缩放控件 */}
          <FontScaleControl />
          {dataUrl && (
            <a
              href={dataUrl}
              download={file.name}
              className="text-xs text-brand-600 hover:underline"
              title="下载原文件"
            >
              ⬇️
            </a>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors"
            title="折叠面板（仅显示文件名）"
          >
            ▸ 折叠
          </button>
        </div>
      </div>

      {/* 文档内容区 ⭐ 修复：用 flex-1 + min-h-0 让子容器能拿到高度 */}
      <div className="flex-1 min-h-0 overflow-hidden bg-white relative">
        {docType === 'pdf' && (
          <iframe
            src={dataUrl + '#toolbar=1&navpanes=0&scrollbar=1'}
            className="w-full h-full border-0 block"
            title={file.name}
          />
        )}

        {(docType === 'docx' || docType === 'doc') && (
          <div className="w-full h-full overflow-y-auto bg-slate-100 p-4">
            {docxError ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                ❌ {docxError}
                <div className="mt-2 text-xs">
                  <a
                    href={dataUrl}
                    download={file.name}
                    className="text-brand-600 hover:underline"
                  >
                    ⬇️ 下载文件查看
                  </a>
                </div>
              </div>
            ) : (
              <div
                ref={docxContainerRef}
                className="docx-container bg-white shadow-md mx-auto"
                style={{ minHeight: '500px', maxWidth: '900px', height: '100%' }}
              />
            )}
          </div>
        )}

        {(docType === 'md' || docType === 'txt' || docType === 'unknown') && (
          <div
            ref={textRef}
            className="p-4 h-full overflow-y-auto font-mono text-slate-700"
          >
            {renderHighlightedText()}
          </div>
        )}

        {highlightText &&
          (docType === 'docx' || docType === 'doc' || docType === 'pdf') &&
          evidenceContexts.length > 0 && (
            <div className="absolute top-3 left-3 right-3 z-10 pointer-events-none">
              <div
                className="pointer-events-auto bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-lg shadow-2xl p-3 max-h-60 overflow-y-auto"
                style={{ animation: 'sow-pulse 2s ease-out' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🔍</span>
                    <span className="text-xs font-bold text-amber-900">
                      证据定位 · 共 {evidenceContexts.length} 处匹配
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-mono">
                    关键词: {evidenceContexts[0]?.keyword}
                  </span>
                </div>
                <div className="space-y-2">
                  {evidenceContexts.map((ctx, i) => (
                    <div
                      key={i}
                      className="bg-white/85 backdrop-blur border border-amber-200 rounded p-2 text-xs leading-relaxed"
                    >
                      <div className="text-[10px] text-amber-600 mb-0.5 font-semibold">
                        📍 第 {i + 1} 处（位置 {ctx.index}）
                      </div>
                      <div className="text-slate-700">
                        <span className="text-slate-500">…{ctx.before}</span>
                        <mark className="bg-yellow-300 text-slate-900 px-1 rounded font-bold shadow-sm">
                          {ctx.match}
                        </mark>
                        <span className="text-slate-500">{ctx.after}…</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>

      {highlightText && (
        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 flex-shrink-0">
          <div className="text-[10px] text-amber-800 flex items-center gap-1.5">
            <span>🔍</span>
            <span className="font-semibold">定位关键词:</span>
            <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-300 truncate flex-1">
              {highlightText}
            </span>
            {docType === 'pdf' || docType === 'docx' ? (
              <span className="text-amber-600 text-[10px]">
                · 请在文档中按 Ctrl+F 搜索 "{evidenceContexts[0]?.keyword || highlightText.slice(0, 10)}"
              </span>
            ) : (
              <span className="text-amber-600 text-[10px]">
                · 已自动滚动到匹配位置
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
