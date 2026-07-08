// POST /api/v1/wbs/auto
// 入参: { file_base64, filename, mime_type, llm_config?, options? }
// 一步完成：SOW 文件 → 提取文本 → WBS 生成。
// 适合外部 Agent（MCP、Coze、Dify 等）一次性调用。

import { Router } from 'express';
import { extractText } from '../../../utils/parser.js';
import { wrapGenerate } from '../../../mcp/util/wrapService.js';
import { httpError } from '../middleware/error.js';

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

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { file_base64, filename, mime_type, llm_config, options = {} } = req.body || {};
    if (!file_base64 || !filename) {
      throw httpError(400, 'bad_request', '需要提供 file_base64 和 filename');
    }
    const buf = Buffer.from(file_base64, 'base64');
    if (buf.length > 30 * 1024 * 1024) {
      throw httpError(413, 'file_too_large', '文件超过 30MB 上限');
    }
    const mimetype = inferMime(filename, mime_type);
    const { text, meta, paragraphs } = await extractText(buf, filename, mimetype);

    const result = await wrapGenerate({
      sowText: text,
      llmConfig: llm_config,
      options,
      onLog: (entry) => {
        const tag = entry.level === 'warn' ? '⚠️' : entry.level === 'error' ? '❌' : '•';
        console.log(`[v1][auto] ${tag} [${entry.stage}] ${entry.msg}`);
      },
    });

    res.json({
      text,
      paragraphs: paragraphs || [],
      fileMeta: { ...meta, filename, mimetype },
      wbs: result.wbs,
      audit: result.audit,
      log: result.log,
      meta: result.meta,
      mock: result.mock,
      degraded: result.degraded,
      degradedReason: result.degradedReason,
    });
  } catch (e) { next(e); }
});

export default router;
