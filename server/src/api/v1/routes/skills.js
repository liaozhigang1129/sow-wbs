// REST 端点：/api/v1/skill/list 和 /api/v1/skill/read
// 让浏览器 / curl 也能浏览/读取 PMO skill，配套 MCP wbs_skill_list / wbs_skill_read

import { Router } from 'express';
import { listSkills, readSkill, SKILLS } from '../../../prompts/index.js';

const router = Router();

router.get('/list', (req, res, next) => {
  try {
    const stage = (req.query.stage || 'all').toString();
    let skills = listSkills();
    if (stage !== 'all') {
      // 用 stage id 直接匹配（保证 stage=master 能命中 "一次性生成" 这种 master skill）
      skills = skills.filter((s) => s.id.includes(stage));
    }
    res.json({
      ok: true,
      total: SKILLS.length,
      matched: skills.length,
      filter: stage,
      skills,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/read', async (req, res, next) => {
  try {
    const id = String(req.query.skill_id || '');
    if (!id) {
      return res.status(400).json({
        error: { code: 'skill_id_required', message: '缺少 skill_id 查询参数' },
      });
    }
    const maxChars = parseInt(req.query.max_chars) || 0;
    const includeMetadata = String(req.query.include_metadata || 'true') === 'true';
    const result = await readSkill(id, { maxChars, includeMetadata });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e.code === 'skill_not_found') {
      return res.status(404).json({ error: { code: e.code, message: e.message } });
    }
    next(e);
  }
});

export default router;
