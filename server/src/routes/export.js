// /api/export - 接收 WBS JSON → 返回 xlsx / md / docx / json
import express from 'express';
import { exportXlsx, exportMarkdown, exportDocx } from '../utils/exporter.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { format, wbs } = req.body || {};
    if (!wbs) return res.status(400).json({ error: '缺少 wbs 数据' });

    const fname = (wbs?.meta?.project || 'wbs').replace(/[^\w\u4e00-\u9fa5-]/g, '_');

    if (format === 'xlsx') {
      const buf = await exportXlsx(wbs);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
      return res.send(Buffer.from(buf));
    }
    if (format === 'md') {
      const text = exportMarkdown(wbs);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.md"`);
      return res.send(text);
    }
    if (format === 'docx') {
      const buf = await exportDocx(wbs);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.docx"`);
      return res.send(Buffer.from(buf));
    }
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.json"`);
      return res.send(JSON.stringify(wbs, null, 2));
    }
    return res.status(400).json({ error: `不支持的格式: ${format}` });
  } catch (err) {
    console.error('[export]', err);
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

export default router;