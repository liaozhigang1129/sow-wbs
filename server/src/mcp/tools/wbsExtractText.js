// MCP 工具：wbs_extract_text
// 从 base64 编码的 SOW 文件中提取纯文本。
// 适用场景：用户在对话里附了 .docx/.pdf/.txt/.md 文件二进制（前端工具可转 base64），希望先抽出文本再调用 wbs_generate。

import { z } from 'zod';
import { extractText } from '../../utils/parser.js';

const MIME_MAP = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
};

function inferMime(filename, fallback) {
  const ext = (filename?.split('.').pop() || '').toLowerCase();
  return MIME_MAP[ext] || fallback || 'application/octet-stream';
}

export const name = 'wbs_extract_text';
export const description =
  '把 base64 编码的 SOW 文档（.docx/.pdf/.txt/.md 等）提取为纯文本。' +
  '适用于：用户在对话中上传了文件 / 上游系统送来 base64 字节流 / 你想先看一下 SOW 包含哪些章节再决定如何拆 WBS。' +
  '返回 text（完整文本）、meta（页数/字符数等）、paragraphs（段落数组，仅 docx）。' +
  '⚠️ 大文件（>5MB）请改用 HTTP `/api/v1/sow/extract/base64`，MCP 工具调用受客户端 base64 大小限制。';

export function register(server) {
  server.tool(
    name,
    description,
    {
      file_base64: z.string().min(1).describe('文件完整 base64 编码（不含 data:URI 前缀）'),
      filename: z.string().min(1).describe('原始文件名，含扩展名（如 sow.docx / 需求.pdf）'),
      mime_type: z.string().optional().describe('MIME 类型，缺省按文件名后缀推断'),
    },
    async ({ file_base64, filename, mime_type }) => {
      try {
        if (file_base64.length > 30 * 1024 * 1024) {
          return errorResult('文件超过 30MB，请改用 HTTP 接口 /api/v1/sow/extract/base64', 'file_too_large');
        }
        const buf = Buffer.from(file_base64, 'base64');
        const mimetype = inferMime(filename, mime_type);
        const { text, meta, paragraphs } = await extractText(buf, filename, mimetype);
        return ok({ ok: true, text, meta, paragraphs: paragraphs || [], file: { name: filename, size: buf.length, mimetype } });
      } catch (e) {
        return errorResult(e?.message || String(e), e?.code || 'internal_error');
      }
    },
  );
}

function ok(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}
function errorResult(message, code) {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code, message } }, null, 2) }] };
}
