// 模拟 WBS 生成（不调用真实 LLM），用于演示/测试日志面板
import express from 'express';

const router = express.Router();

// 返回一个最小的合法 WBS JSON（供前端日志展示使用）
function fakeWBS() {
  return {
    meta: {
      projectName: '【模拟】行内信贷智能体建设项目',
      projectCode: 'MOCK-001',
      projectType: '预测型/Predictive',
      durationWeeks: 24,
      durationMonths: 6,
      deliverables: ['需求规格说明书', '系统设计文档', '上线投产报告'],
      scopeBoundary: { inScope: ['智能问答', '报告生成'], outOfScope: ['核心系统改造'] },
      assumptions: ['行内 GPU 资源到位'],
      constraints: ['等保三级'],
      stakeholders: [{ role: '甲方 PMO', responsibility: '整体监管' }],
    },
    milestones: [
      { id: 'M1', name: '需求确认', phase: '启动', weekOffset: 2, deliverable: '需求基线' },
      { id: 'M2', name: '上线投产', phase: '收尾', weekOffset: 24, deliverable: '投产报告' },
    ],
    wbs: [
      {
        id: '1', code: '1', name: '【模拟】行内信贷智能体建设项目', level: 1, estimatedHours: 0,
        children: [
          { id: '1.1', code: '1.1', name: '需求阶段', level: 2, estimatedHours: 80,
            children: [
              { id: '1.1.1', code: '1.1.1', name: '需求调研', level: 3, estimatedHours: 32, deliverable: '调研记录', owner: 'BA' },
              { id: '1.1.2', code: '1.1.2', name: '需求评审', level: 3, estimatedHours: 24, deliverable: '评审纪要', owner: 'PM' },
            ],
          },
          { id: '1.2', code: '1.2', name: '实施阶段', level: 2, estimatedHours: 120,
            children: [
              { id: '1.2.1', code: '1.2.1', name: '编码实现', level: 3, estimatedHours: 80, deliverable: '可运行系统', owner: 'DEV' },
            ],
          },
        ],
      },
    ],
  };
}

const ts = () => new Date().toISOString().slice(11, 23);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

router.post('/', async (req, res) => {
  const log = [];
  const push = (level, stage, msg, data) => log.push({ t: ts(), level, stage, msg, data });

  push('info', 'start', '🧪 进入【模拟生成】模式，不调用真实 LLM');
  push('info', 'input', 'SOW 已接收', { length: (req.body?.sowText || '').length });
  await sleep(150);

  push('info', 'prompt', '📝 模拟组装 Prompt', { model: 'mock', sowChars: 1234 });
  await sleep(150);

  push('info', 'call.1', '📡 第 1 次调用 LLM');
  await sleep(100);
  push('info', 'call', '→ 调用 mock gpt-4o-mini', { baseUrl: 'mock://', maxTokens: 16000 });
  await sleep(200);

  push('warn', 'retry', '🔄 mock 第 1 次失败 [503]，150ms，1.5s 后重试', { attempt: 1, status: 503 });
  await sleep(300);
  push('warn', 'retry', '🔄 mock 第 2 次成功', { attempt: 2 });
  await sleep(150);

  push('info', 'call.done', '← mock 返回 1024 字符，580ms', { latencyMs: 580, chars: 1024, finishReason: 'stop' });
  push('info', 'parse', '✅ JSON 解析成功');
  push('info', 'validate', '🧪 WBS 校验通过', { nodes: 32, hours: 1312 });
  push('info', 'enrich', '🧱 节点补全完成', { autoFilled: 3 });
  push('info', 'ok', '🎉 模拟生成完成', { totalMs: 1500 });

  res.json({
    ok: true,
    mock: true,
    wbs: fakeWBS(),
    log,
    stats: { totalNodes: 32, totalHours: 1312, errors: 0, warnings: 1 },
  });
});

export default router;