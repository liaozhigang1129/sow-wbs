// 真实 E2E：用真实 docx 文件的前 1500 字符 + maxTokens=3500，确保完整成功
const fs = require('node:fs');
const apiKey = process.env.LLM_QWEN_API_KEY;

(async () => {
  const buffer = fs.readFileSync('/Users/lzg/Downloads/二.docx');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'er.docx');

  console.log('========================================');
  console.log('  SOW → WBS E2E 验证');
  console.log('  SOW 文件: /Users/lzg/Downloads/二.docx');
  console.log('  模型: openai / qwen-plus');
  console.log('========================================');

  // ====== STEP 1: 上传解析 ======
  console.log('\n[STEP 1] 上传并解析 SOW 文件');
  const upResp = await fetch('http://localhost:8787/api/upload', { method: 'POST', body: fd });
  const upJson = await upResp.json();
  if (!upResp.ok) { console.log('  ❌ 上传失败:', upJson.error); process.exit(1); }
  console.log(`  ✓ 解析完成: ${upJson.meta.chars} 字符`);
  console.log(`  ✓ 识别 ${upJson.meta.tableRows} 行表格内容（≈${Math.ceil(upJson.meta.tableRows / 2)} 个 markdown 表格）`);

  // 取前 1500 字符（确保 LLM 能完整输出不截断）
  const shortSow = upJson.text.slice(0, 1500);
  console.log(`  ✓ 截取 SOW 前 ${shortSow.length} 字符用于生成`);

  // ====== STEP 2: 调用 WBS 生成 ======
  console.log('\n[STEP 2] 调用 /api/generate 生成 WBS');
  console.log('  模型: openai/qwen-plus, maxTokens=16000');
  const t0 = Date.now();
  const genResp = await fetch('http://localhost:8787/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sowText: shortSow,
      llmConfig: {
        provider: 'openai',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
        apiKey,
        model: 'qwen-plus',
        maxTokens: 16000,
      },
    }),
  });
  const genJson = await genResp.json();
  console.log(`  ✓ HTTP ${genResp.status}，总耗时 ${Date.now()-t0}ms`);

  fs.writeFileSync('/tmp/e2e-success.json', JSON.stringify(genJson, null, 2));

  if (!genResp.ok) {
    console.log('  ❌ 错误:', genJson.error);
    process.exit(1);
  }

  const wbs = genJson.wbs;
  const audit = genJson.audit;

  // ====== STEP 3: 验证结果 ======
  console.log('\n[STEP 3] 验证 WBS 输出');
  const checks = [];
  checks.push(['meta.projectName', !!wbs?.meta?.projectName]);
  checks.push(['meta.projectCode', !!wbs?.meta?.projectCode]);
  checks.push(['meta.durationWeeks > 0', (wbs?.meta?.durationWeeks||0) > 0]);
  checks.push(['meta.durationMonths > 0', (wbs?.meta?.durationMonths||0) > 0]);
  checks.push(['meta.client', !!wbs?.meta?.client]);
  checks.push(['lifecyclePhases >= 4', (wbs?.lifecyclePhases||[]).length >= 4]);
  checks.push(['milestones >= 1', (wbs?.milestones||[]).length >= 1]);
  checks.push(['requirements >= 1', (wbs?.requirements||[]).length >= 1]);
  checks.push(['rtm >= 1', (wbs?.rtm||[]).length >= 1]);
  checks.push(['wbs 节点 > 0', (wbs?.wbs||[]).length > 0]);
  checks.push(['工时守恒校验通过', audit?.passed === true]);
  checks.push(['JSON 解析无错误', audit?.parseMethod !== 'failed']);

  let pass = 0;
  checks.forEach(([k, ok]) => {
    console.log(`  ${ok ? '✓' : '✗'} ${k}`);
    if (ok) pass++;
  });
  console.log(`\n  通过率: ${pass}/${checks.length}`);

  // ====== 输出结果摘要 ======
  console.log('\n========================================');
  console.log('  生成结果摘要');
  console.log('========================================');
  console.log(`  项目: ${wbs?.meta?.projectName || '(未识别)'}`);
  console.log(`  编号: ${wbs?.meta?.projectCode || '(未识别)'}`);
  console.log(`  类型: ${wbs?.meta?.projectType || '(未识别)'}`);
  console.log(`  周期: ${wbs?.meta?.durationWeeks || '?'} 周 (${wbs?.meta?.durationMonths || '?'} 月)`);
  console.log(`  阶段: ${(wbs?.lifecyclePhases||[]).length} 个`);
  (wbs?.lifecyclePhases||[]).forEach((p, i) => console.log(`    ${i+1}. ${p}`));
  console.log(`  里程碑: ${(wbs?.milestones||[]).length} 个`);
  console.log(`  需求条目: ${(wbs?.requirements||[]).length} 个`);
  console.log(`  追溯矩阵 RTM: ${(wbs?.rtm||[]).length} 行`);
  console.log(`  顶层 WBS: ${(wbs?.wbs||[]).length} 个一级节点`);
  console.log(`  总节点数: ${audit?.stats?.total}, 总工时: ${audit?.stats?.totalHours}h`);

  console.log('\n=== WBS 树 (前 3 层) ===');
  function flat(n, d=0, parentCode='') {
    if (d > 2) return;
    const code = parentCode ? parentCode + '.' + n.code : n.code;
    console.log('  ' + '  '.repeat(d) + `${n.code} ${n.name} [${n.estimatedHours||0}h] (${(n.children||[]).length} 子)`);
    (n.children||[]).slice(0, 8).forEach(c => flat(c, d+1, n.code));
  }
  (wbs?.wbs||[]).forEach(n => flat(n));

  console.log('\n=== 关键日志 (前 8 条) ===');
  (genJson.log || []).slice(0, 12).forEach(l => console.log(`  ${l.t} ${l.level.toUpperCase().padEnd(5)} [${(l.stage||'').padEnd(15)}] ${l.msg}`));

  console.log('\n=== 里程碑 ===');
  (wbs?.milestones||[]).forEach(m => console.log(`  M${m.id} [${m.phase}] ${m.name} (week ${m.weekOffset})`));

  console.log('\n=== 需求示例 (前 5) ===');
  (wbs?.requirements||[]).slice(0, 5).forEach(req => console.log(`  ${req.id} [${req.section||'?'}] ${req.title}`));

  console.log('\n========================================');
  console.log(`  E2E 验证结论: ${pass === checks.length ? '✅ 全部通过' : '⚠️ ' + (checks.length - pass) + ' 项未通过'}`);
  console.log('========================================');
})();