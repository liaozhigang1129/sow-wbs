// POST /api/v1/wbs/export
// 入参: { format: 'xlsx' | 'md' | 'docx' | 'json', wbs }
// 出参: 二进制文件流（Content-Disposition 携带文件名）

import { Router } from 'express';
import { exportXlsx, exportMarkdown, exportDocx } from '../../../utils/exporter.js';
import { httpError } from '../middleware/error.js';

const EXT = { xlsx: 'xlsx', md: 'md', docx: 'docx', json: 'json' };
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  md: 'text/markdown; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  json: 'application/json; charset=utf-8',
};

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { format, wbs } = req.body || {};
    if (!EXT[format]) {
      throw httpError(400, 'format_invalid', `format 必须为: ${Object.keys(EXT).join(', ')}`);
    }
    if (!wbs || typeof wbs !== 'object') {
      throw httpError(400, 'wbs_required', '需要提供 wbs 对象');
    }

    const base = (wbs?.meta?.project || 'wbs').replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    const filename = `${base}.${EXT[format]}`;

    let body;
    if (format === 'xlsx') {
      body = Buffer.from(await exportXlsx(wbs));
    } else if (format === 'md') {
      body = exportMarkdown(wbs);
    } else if (format === 'docx') {
      body = Buffer.from(await exportDocx(wbs));
    } else {
      // json
      body = JSON.stringify(wbs, null, 2);
    }

    res.set({
      'Content-Type': MIME[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': Buffer.byteLength(body),
    });
    res.send(body);
  } catch (e) { next(e); }
});

export default router;
