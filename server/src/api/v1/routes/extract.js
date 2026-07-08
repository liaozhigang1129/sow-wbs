// POST /api/v1/sow/extract       - multipart/form-data 上传
// POST /api/v1/sow/extract/base64 - JSON body { file_base64, filename, mime_type }
//
// 复用 utils/parser.extractText，不暴露原始 buffer（base64 太大，外部直接拿 text 即可）

import { Router } from 'express';
import multer from 'multer';
import { extractText } from '../../../utils/parser.js';
import { httpError } from '../middleware/error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB 公开 API 限制略高于内部
});

const router = Router();

// MIME 兜底映射（和 routes/upload.js 一致）
const MIME_MAP = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  md: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
};

function inferMime(filename, fallback) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MIME_MAP[ext] || fallback || 'application/octet-stream';
}

// 1) multipart
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw httpError(400, 'file_required', '缺少 file 字段（multipart/form-data）');
    const filename = req.file.originalname;
    let mimetype = req.file.mimetype;
    if (!mimetype || mimetype === 'application/octet-stream') {
      mimetype = inferMime(filename, mimetype);
    }
    const { text, meta, paragraphs } = await extractText(req.file.buffer, filename, mimetype);
    res.json({
      text,
      meta: { ...meta, filename, mimetype },
      paragraphs: paragraphs || [],
      file: { name: filename, size: req.file.size, mimetype },
      // 注意：v1 不回传 base64，避免大 payload（前端预览需要时再走 /api/upload）
    });
  } catch (e) { next(e); }
});

// 2) JSON base64
router.post('/base64', async (req, res, next) => {
  try {
    const { file_base64, filename, mime_type } = req.body || {};
    if (!file_base64 || !filename) {
      throw httpError(400, 'bad_request', '需要提供 file_base64 和 filename');
    }
    const buf = Buffer.from(file_base64, 'base64');
    const mimetype = inferMime(filename, mime_type);
    const { text, meta, paragraphs } = await extractText(buf, filename, mimetype);
    res.json({
      text,
      meta: { ...meta, filename, mimetype },
      paragraphs: paragraphs || [],
      file: { name: filename, size: buf.length, mimetype },
    });
  } catch (e) { next(e); }
});

export default router;
