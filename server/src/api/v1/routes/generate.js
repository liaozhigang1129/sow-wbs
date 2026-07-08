// POST /api/v1/wbs/generate
// 入参: { sow_text, llm_config?, options? }
// 出参: { wbs, audit, log, meta, mock?, degraded?, degradedReason? }

import { Router } from 'express';
import { wrapGenerate } from '../../../mcp/util/wrapService.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { sow_text, llm_config, options = {} } = req.body || {};
    const result = await wrapGenerate({
      sowText: sow_text,
      llmConfig: llm_config,
      options,
      onLog: (entry) => {
        const tag = entry.level === 'warn' ? '⚠️' : entry.level === 'error' ? '❌' : '•';
        console.log(`[v1][generate] ${tag} [${entry.stage}] ${entry.msg}`);
      },
    });
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
