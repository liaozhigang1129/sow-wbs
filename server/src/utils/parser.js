// SOW 文档解析器：支持 .txt .md .docx .pdf（含表格转 markdown）
import mammoth from 'mammoth';
import { marked } from 'marked';

let pdfParse;
async function loadPdfParse() {
  if (!pdfParse) {
    const mod = await import('pdf-parse');
    pdfParse = mod.default || mod;
  }
  return pdfParse;
}

/* =====================================================================
 *  表格识别与转 Markdown
 * ===================================================================== */

/**
 * 智能表格识别：检测「多列对齐」PDF 文本块，转换为 markdown 表格
 * 启发式：连续 3+ 行每行有 2+ 个「间隔 ≥ 2 个空格的列」时判定为表格
 */
function pdfTextToStructured(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const block = detectTableBlock(lines, i);
    if (block) {
      out.push(block.markdown);
      i = block.endIndex;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\n');
}

function detectTableBlock(lines, startIdx) {
  // 收集候选行：包含 2+ 个「≥2 空格分隔」的列
  const colsOf = (s) => {
    const parts = s.trim().split(/\s{2,}|\t+/);
    return parts.filter((p) => p.length > 0);
  };

  let i = startIdx;
  const candidateLines = [];
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (candidateLines.length >= 2) break;
      i++;
      continue;
    }
    const cols = colsOf(line);
    if (cols.length >= 2) {
      candidateLines.push({ line, cols });
      i++;
    } else {
      break;
    }
  }

  if (candidateLines.length < 2) return null;

  // 必须是「列数稳定」的表格（首两行列数相同或相近）
  const firstCols = candidateLines[0].cols.length;
  const consistent = candidateLines
    .slice(0, Math.min(candidateLines.length, 5))
    .every((r) => Math.abs(r.cols.length - firstCols) <= 1);
  if (!consistent) return null;

  // 取最常见列数
  const colCount = firstCols;
  const rows = candidateLines.map((r) => {
    const cols = r.cols.slice(0, colCount);
    while (cols.length < colCount) cols.push('');
    return cols.map((c) => c.trim());
  });

  // 构造 markdown 表格
  const md = rowsToMarkdownTable(rows);
  return { markdown: md, endIndex: i };
}

function rowsToMarkdownTable(rows) {
  if (rows.length === 0) return '';
  const colCount = rows[0].length;
  // 第一行作为表头
  const header = rows[0];
  const separator = Array(colCount).fill('---');
  const body = rows.slice(1);

  const escapeCell = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  const fmt = (row) => `| ${row.map(escapeCell).join(' | ')} |`;

  let md = fmt(header) + '\n' + fmt(separator) + '\n';

  // ⭐ v2.8 关键修复：只对第 1 列（分组列）做合并单元格向上传播
  // Word/PDF 表格中"分组列"（如里程碑阶段）合并后，其他列依然独立
  // 避免传播"签收"等非分组列导致重复
  const propagated = body.map((row, i, all) => {
    const cells = row.slice(0, colCount);
    while (cells.length < colCount) cells.push('');
    if (i === 0) return cells;
    if (!cells[0] || cells[0].trim() === '') {
      for (let j = i - 1; j >= 0; j--) {
        const prev = all[j].slice(0, colCount);
        if (prev[0] && prev[0].trim() !== '') {
          cells[0] = prev[0];
          break;
        }
      }
    }
    return cells;
  });

  for (const r of propagated) md += fmt(r) + '\n';
  return md.trimEnd();
}

/**
 * mammoth 自定义转换：将 <w:tbl> 转为 markdown 表格
 * 参考：https://github.com/mwilliamson/mammoth.js#custom-style-map
 */
function mammothTableStyleMap() {
  // mammoth 不直接支持表格到 markdown，但可通过 convertElement 拦截
  // 这里返回 styleMap 用于基本样式；表格用下方 extractWithTables 处理
  return {};
}

/**
 * 用 mammoth 的 rawHtml 拿到表格 HTML，再解析为 markdown 表格
 * ⭐ v2.14 同时返回段落数组（用于前端高亮定位）
 */
async function extractDocxWithTables(buffer) {
  // 1) 先尝试 rawHtml（保留表格结构）
  let html = '';
  let paragraphHtml = ''; // 段落级 HTML（保留 <p> 标签，供前端定位）
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer });
    html = htmlResult.value || '';
    paragraphHtml = html;
  } catch (err) {
    // 失败时回退到纯文本
    const textResult = await mammoth.extractRawText({ buffer });
    return textResult.value || '';
  }
  // 2) 把 <table>...</table> 转 markdown
  html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => htmlTableToMarkdown(inner));
  // 3) 其它 HTML 转纯文本
  const plainText = html
    .replace(/<\/?(h\d|p|li|ul|ol|br|div)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  // ⭐ v2.14: 同步生成 paragraphs 数组（带 paragraphHtml 给前端用）
  // 段落提取策略：按 <p> 切分，保留每个段落的纯文本与原 HTML
  // 存到全局，供 extractText 读取
  extractDocxWithTables._lastParagraphs = extractParagraphs(paragraphHtml);
  return plainText;
}

/**
 * ⭐ v2.14: 从 mammoth 的原始 HTML 中提取段落列表
 * 用于前端高亮定位（按段落 <p> 索引匹配关键词）
 */
function extractParagraphs(html) {
  if (!html) return [];
  const paragraphs = [];
  // 匹配 <p> 标签内容（支持嵌套标签）
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  let idx = 0;
  while ((m = pRegex.exec(html)) !== null) {
    const inner = m[1]
      .replace(/<[^>]+>/g, '') // 去嵌套标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
    if (inner) {
      paragraphs.push({ idx: idx++, text: inner });
    }
  }
  // 如果没找到任何 <p>，尝试按 <h1>~<h6>、<li> 切分
  if (paragraphs.length === 0) {
    const blockRegex = /<(h[1-6]|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    while ((m = blockRegex.exec(html)) !== null) {
      const inner = m[2].replace(/<[^>]+>/g, '').trim();
      if (inner) {
        paragraphs.push({ idx: idx++, text: inner });
      }
    }
  }
  return paragraphs;
}

function htmlTableToMarkdown(tableHtml) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRegex.exec(tableHtml)) !== null) {
    const cells = [];
    const cellRegex = /<t[hd][^>]*colspan="(\d+)"[^>]*>([\s\S]*?)<\/t[hd]>|<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cm;
    while ((cm = cellRegex.exec(m[1])) !== null) {
      const colspan = parseInt(cm[1] || '1', 10);
      const raw = cm[2] !== undefined ? cm[2] : cm[3];
      const txt = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(txt);
      for (let k = 1; k < colspan; k++) cells.push('');
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return '';
  const colCount = rows[0].length;
  const escapeCell = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  let md = `| ${rows[0].map(escapeCell).join(' | ')} |\n`;
  md += `| ${Array(colCount).fill('---').join(' | ')} |\n`;

  // ⭐ v2.8 修复：处理 Word 表格 rowSpan 合并的分组列
  // 当一行 cells.length < colCount 时，说明前面有列被合并掉了
  // 必须从前面（左侧）补齐空白，而非从后面追加
  // 同时向上传播最近的分组标签到第 1 列
  const body = rows.slice(1).map((row, i, all) => {
    let cells = row.slice();
    // ⭐ 关键修复：当 cells 数量少于 colCount 时，从前面（左侧）补空字符串
    // 而不是从后面追加（保留原有 cell 的列位置不变）
    while (cells.length < colCount) {
      cells.unshift('');
    }
    if (cells.length > colCount) cells = cells.slice(0, colCount);

    // 如果第 1 列为空（被 rowSpan 合并掉了），向上传播前一个非空分组标签
    if (i > 0 && (!cells[0] || cells[0].trim() === '')) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = all[j].slice();
        while (prev.length < colCount) prev.unshift('');
        if (prev[0] && prev[0].trim() !== '') {
          cells[0] = prev[0];
          break;
        }
      }
    }
    return cells;
  });
  for (const cells of body) {
    md += `| ${cells.map(escapeCell).join(' | ')} |\n`;
  }
  return md.trimEnd();
}

/* =====================================================================
 *  主入口
 * ===================================================================== */

/**
 * 从 buffer 中提取纯文本（保留表格结构为 markdown）
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {string} mimetype
 * @returns {Promise<{text: string, meta: object}>}
 */
export async function extractText(buffer, filename, mimetype) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const text0 = buffer.toString('utf-8');
  let text = '';
  let meta = {
    filename,
    ext,
    mimetype,
    chars: 0,
    tablesDetected: 0,
  };

  try {
    // 检测 PDF 文件签名 %PDF-
    const isPdfBuffer = buffer.length > 4 && buffer.slice(0, 5).toString('utf-8') === '%PDF-';

    if (ext === 'docx' || mimetype.includes('word') || mimetype.includes('officedocument')) {
      text = await extractDocxWithTables(buffer);
      meta.tablesDetected = (text.match(/^\|.*\|$/gm) || []).length / 2; // 表格行数（含表头+分隔）
    } else if ((ext === 'pdf' || mimetype === 'application/pdf') && isPdfBuffer) {
      const parser = await loadPdfParse();
      const result = await parser(buffer);
      const rawText = result.text || '';
      meta.pdfPages = result.numpages;
      // PDF 表格识别
      text = pdfTextToStructured(rawText);
      meta.tablesDetected = (text.match(/^\|.*\|$/gm) || []).length / 2;
    } else if (ext === 'md' || mimetype === 'text/markdown') {
      // 已经是 markdown：表格行直接保留，其它通过 marked 转换
      const mdLines = text0.split('\n');
      const kept = [];
      const nonTableLines = [];
      let tableRowCount = 0;
      for (const line of mdLines) {
        if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?\s*:?-+:?\s*\|/.test(line)) {
          kept.push(line.trim());
          tableRowCount++;
        } else {
          nonTableLines.push(line);
        }
      }
      const nonTableText = nonTableLines.join('\n');
      const html = await marked.parse(nonTableText);
      const stripped = html
        .replace(/<\/?(h\d|p|li|ul|ol|br|div)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      // 交错合并表格与非表格内容（按原顺序）
      const strippedLines = stripped.split('\n');
      let ti = 0, ni = 0;
      const merged = [];
      for (const line of mdLines) {
        if (/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?\s*:?-+:?\s*\|/.test(line)) {
          merged.push(kept[ti++]);
        } else {
          // 找下一个非空 stripped
          while (ni < strippedLines.length && !strippedLines[ni].trim()) ni++;
          merged.push(strippedLines[ni++] || '');
        }
      }
      text = merged.join('\n');
      meta.tablesDetected = tableRowCount / 2;
    } else if (ext === 'txt' || mimetype.startsWith('text/')) {
      text = text0;
      // txt 也尝试识别表格
      text = pdfTextToStructured(text);
      meta.tablesDetected = (text.match(/^\|.*\|$/gm) || []).length / 2;
    } else {
      // 兜底：按 utf-8 文本处理
      text = pdfTextToStructured(text0);
      meta.tablesDetected = (text.match(/^\|.*\|$/gm) || []).length / 2;
    }
  } catch (err) {
    throw new Error(`文档解析失败: ${err.message}`);
  }

  // 清理多余空白（保留 markdown 表格边界）
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n') // 去除行尾空白
    .replace(/[ \t]{2,}/g, ' ') // 多个空格合并（不影响 markdown 表格内的 |）
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 二次校正：表格行内被空格合并规则破坏的，重新还原
  text = restoreMarkdownTables(text);

  meta.chars = text.length;
  meta.tableRows = (text.match(/^\|.*\|$/gm) || []).length;
  // ⭐ v2.14: 暴露段落数组给调用方（供 docx 高亮定位用）
  const result = { text, meta };
  if (ext === 'docx' || mimetype.includes('word') || mimetype.includes('officedocument')) {
    result.paragraphs = extractDocxWithTables._lastParagraphs || [];
  }
  return result;
}

function restoreMarkdownTables(text) {
  const lines = text.split('\n');
  const fixed = [];
  for (const line of lines) {
    // 形如 "| a | b | c |" 的行原样保留
    if (/^\s*\|.*\|\s*$/.test(line)) {
      fixed.push(line.replace(/\s{2,}/g, ' ').trim());
    } else {
      fixed.push(line);
    }
  }
  return fixed.join('\n');
}

/**
 * 截断过长的 SOW，防止超出模型上下文
 */
export function truncateForLLM(text, maxChars = 60000) {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.7));
  const tail = text.slice(-Math.floor(maxChars * 0.25));
  return `${head}\n\n[... 内容过长，中间 ${text.length - head.length - tail.length} 字符已省略 ...]\n\n${tail}`;
}