// /api/upload - 接收 SOW 文件（docx/pdf/txt/md） → 解析返回纯文本 + 原始文件 base64
import express from 'express';
import multer from 'multer';
import { extractText } from '../utils/parser.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

/**
 * ⭐ v2.12 修复中文文件名乱码
 *
 * multer 1.4.x 默认将 multipart 中的 filename 按 latin1 解码，
 * 但浏览器实际发送 UTF-8 编码，导致中文文件名乱码。
 *
 * 修复策略：对 originalname 做 latin1 → utf8 二次解码
 *   1. 如果包含 UTF-8 多字节字符（中文） → 还原
 *   2. 如果是纯 ASCII → 保持原样
 *   3. 如果还原后仍是乱码 → 保留 latin1 解码结果（兜底）
 */
function fixMojibake(originalname) {
  if (!originalname) return originalname;

  // ASCII 文件名不需要处理
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(originalname)) return originalname;

  try {
    // 尝试 latin1 → utf8 反向解码
    const restored = Buffer.from(originalname, 'latin1').toString('utf8');

    // 校验：还原后不应包含 U+FFFD（替换字符）或乱码控制字符
    // eslint-disable-next-line no-control-regex
    const hasReplacementChar = restored.includes('\uFFFD');
    // 还原后中文范围 \u4e00-\u9fff 出现则视为正确
    const hasChinese = /[\u4e00-\u9fff]/.test(restored);

    if (hasChinese && !hasReplacementChar) {
      return restored;
    }

    // 还原失败，尝试用 iconv-lite
    // （部分环境 multer 用 latin1，部分用 ascii 截断）
    return originalname;
  } catch {
    return originalname;
  }
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '未上传文件' });

    // ⭐ v2.12: 修复中文文件名乱码
    const originalFilename = fixMojibake(req.file.originalname);

    // ⭐ 修复 mimetype：当浏览器/系统未提供正确 mimetype 时，根据扩展名推断
    let mimetype = req.file.mimetype;
    if (!mimetype || mimetype === 'application/octet-stream') {
      const ext = (originalFilename.split('.').pop() || '').toLowerCase();
      const mimeMap = {
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        pdf: 'application/pdf',
        md: 'text/markdown',
        txt: 'text/plain',
        json: 'application/json',
      };
      mimetype = mimeMap[ext] || mimetype;
    }

    const { text, meta, paragraphs } = await extractText(
      req.file.buffer,
      originalFilename,
      mimetype,
    );

    // ⭐ 返回原始文件的 base64 编码，供前端预览 Word/PDF 等文档
    const fileBase64 = req.file.buffer.toString('base64');

    res.json({
      text,
      meta: {
        ...meta,
        filename: originalFilename, // 覆盖 meta 里的 filename
        mimetype, // 使用修正后的 mimetype
      },
      filename: originalFilename,
      // ⭐ v2.14: 段落数组（仅 docx，用于前端高亮定位）
      paragraphs: paragraphs || [],
      // 用于前端 SOW 文档预览面板
      file: {
        name: originalFilename,
        size: req.file.size,
        mimetype,
        base64: fileBase64,
      },
    });
  } catch (err) {
    console.error('[upload]', err);
    res.status(500).json({ error: err.message || '解析失败' });
  }
});

export default router;