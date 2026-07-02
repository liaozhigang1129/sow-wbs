// 模拟真实完整流程：跑完整 wbsService，看哪一步抛错
import { extractJSON, tryRepairTruncatedJSON } from '../src/services/llm.js';
import { generateWBS } from '../src/services/wbsService.js';

const llmConfig = {
  provider: 'claude_hexai',
  baseUrl: 'https://crs.hexai.cn/api/v1',
  apiKey: process.env.HEXAI_API_KEY,
  model: 'claude-sonnet-4-20250514',
  temperature: 0,
  maxTokens: 15,  // ⭐ 故意设极小
};

const sowText = `本项目为资产托管运营智慧化管理系统建设项目，要求实现文件智能管理与质效管理两大模块。工期 5 个月，团队 6 人。请输出完整 WBS。`;

console.log('=== 模拟完整流程 ===');
console.log('LLM 配置:', { provider: llmConfig.provider, model: llmConfig.model, maxTokens: llmConfig.maxTokens });

const t0 = Date.now();
try {
  const result = await generateWBS({ sowText, llmConfig });
  console.log('✅ 生成成功！耗时:', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('parseMethod:', result.meta?.parseMethod);
  console.log('parseWarning:', result.meta?.parseWarning);
  console.log('wbs.wbs[0]:', result.wbs.wbs?.[0]?.name);
  console.log('log 摘要:');
  result.log.slice(0, 15).forEach((l) => console.log('  ', l.level, '|', l.stage, '|', l.msg?.slice(0, 80)));
} catch (e) {
  console.log('❌ 生成失败，耗时:', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('错误信息（前 600 字符）:');
  console.log(e.message.slice(0, 600));
  console.log('\n--- log 全部 ---');
  e.log?.forEach((l) => console.log(l.level, '|', l.stage, '|', l.msg?.slice(0, 100)));
}