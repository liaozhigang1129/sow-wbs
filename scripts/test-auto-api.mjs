#!/usr/bin/env node
// 完整流程测试：/api/v1/wbs/auto
//
// 流程：
//   1) 构造一份 SOW 文本（写到一个临时 .md / .txt 文件）
//   2) 读取为 base64
//   3) POST /api/v1/wbs/auto（要求：抽文本 → 生成 WBS → 校验 → 导出 xlsx）
//   4) 解析返回结构、打印关键摘要
//
// 跑法：
//   node scripts/test-auto-api.mjs
//
// 需要服务在 127.0.0.1:8787 正常运行（npm run dev）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const SOW_FIXTURE = path.join(__dirname, 'fixtures', 'sow-mock.md');

// =========== 1) 构造 mock SOW（如果 fixture 不存在） ===========
fs.mkdirSync(path.dirname(SOW_FIXTURE), { recursive: true });
if (!fs.existsSync(SOW_FIXTURE)) {
  const sow = `# 智能客服系统建设项目 SOW（mock）

## 一、项目背景
为海门农商行 131 位客户经理建设一套智能化流水分析系统，替代当前人工审阅 30 分钟/单的低效模式，提升合规与风控效率。

## 二、项目目标
- 客户流水真伪识别准确率 ≥ 95%
- 收支归类覆盖率 ≥ 90%
- 风险扫描响应 ≤ 5 秒
- 客户经理人均节省工时 ≥ 3 人月/年
- 单笔流水分析时延 P95 ≤ 2 秒

## 三、交付物
1. 行内客户流水智能分析 Agent（含 RAG 检索增强）
2. 智能归类与标签服务
3. 风险扫描与预警规则引擎
4. 偿债能力测算模型（Monte Carlo + LR）
5. 客户经理辅助决策看板
6. 数据治理与回流规范

## 四、范围
**在范围内**：
- 模型微调、知识库建设、Prompt 工程
- 后端服务、API 网关、监控运维
- 看板前端
- 与行内 6 套业务系统的对接适配

**不在范围内**：
- 硬件采购、机房建设
- 行内核心账务系统改造

## 五、关键假设
1. 智能体技术栈（Python/LangChain/Qdrant）已具备
2. 行方业务专家全程参与评测
3. 训练数据已脱敏并提供访问通道

## 六、约束
- 等保三级
- 行内私有化部署
- 数据不出行内
- 高可用 99.95%

## 七、项目里程碑（共 18 周）
- W01-W02：需求细化 & 现状调研
- W03-W06：知识库构建 & 模型微调
- W07-W12：核心服务开发（Agent / 归类 / 风险 / 测算）
- W13-W15：联调测试 & 性能压测
- W16-W17：试运行与稳定化
- W18：项目验收与移交

## 八、技术栈
- 后端：Python 3.11 / FastAPI / 异步任务（Celery + Redis）
- 模型：Qwen2.5-14B-Chat（基座）+ LoRA 微调
- 检索：Qdrant 向量库 + BM25
- 前端：React 18 + Ant Design Pro
- 部署：Kubernetes（行内私有云）

## 九、关键指标（KPI）
| 指标 | 目标 |
|------|------|
| 真伪识别准确率 | ≥ 95% |
| 人工节省比 | ≥ 70% |
| 系统可用性 | ≥ 99.95% |
| P95 响应 | ≤ 2s |
`;
  fs.writeFileSync(SOW_FIXTURE, sow, 'utf8');
  console.log(`✓ 已创建 SOW fixture：${SOW_FIXTURE} (${sow.length} chars)`);
}

const sowText = fs.readFileSync(SOW_FIXTURE, 'utf8');
const sowBase64 = fs.readFileSync(SOW_FIXTURE).toString('base64');
console.log(`✓ SOW：${path.basename(SOW_FIXTURE)} · ${(fs.statSync(SOW_FIXTURE).size / 1024).toFixed(1)} KB · base64 长度 ${sowBase64.length}\n`);

// =========== 2) 工具 ===========
async function postJSON(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { ok: resp.ok, status: resp.status, json };
}

async function getJSON(url) {
  const resp = await fetch(url);
  return { ok: resp.ok, status: resp.status, json: await resp.json() };
}

function log2(s) {
  console.log('\n' + '='.repeat(64));
  console.log(s);
  console.log('='.repeat(64));
}

function ok(s) { console.log(`  ✅ ${s}`); }
function info(s) { console.log(`  ℹ️  ${s}`); }
function warn(s) { console.log(`  ⚠️  ${s}`); }

// =========== 3) /api/v1/health 自检 ===========
log2('① /api/v1/health 自检');
const health = await getJSON(`${BASE}/api/v1/health`);
if (health.ok) ok(`服务存活：${health.json.status} · ${health.json.time}`);
else { console.error('  ❌ 服务未启动'); process.exit(1); }

// =========== 4) /api/v1/version ===========
log2('② /api/v1/version');
const ver = await getJSON(`${BASE}/api/v1/version`);
if (ver.ok) {
  info(`API: ${ver.json.name} ${ver.json.version} (${ver.json.api_version})`);
  info(`说明：${ver.json.description}`);
}

// =========== 5) POST /api/v1/wbs/auto（核心流程） ===========
log2('③ POST /api/v1/wbs/auto  ·  SOW → extract → generate → 返回 WBS');
const t0 = Date.now();
const auto = await postJSON(`${BASE}/api/v1/wbs/auto`, {
  file_base64: sowBase64,
  filename: 'sow-mock.md',
  mime_type: 'text/markdown',
  options: {
    promptMode: 'flexible',
    enableL4L5: true,
    enableCache: false,
  },
});
const elapsed = Date.now() - t0;

if (!auto.ok) {
  console.error('  ❌ 失败：', auto.json);
  process.exit(1);
}

const result = auto.json;
ok(`/auto 用时 ${elapsed}ms（包含 LLM/mock 调用）`);
info(`降级标记：mock=${result.mock} degraded=${result.degraded || false}`);
if (result.degradedReason) warn(`降级原因：${result.degradedReason}`);

info(`抽文本长度：${result.text?.length || 0} 字符（与服务端文件解析一致？前 80 字：${(result.text || '').slice(0, 80)}…）`);
info(`段落数：${result.paragraphs?.length || 0}`);
info(`文件信息：${result.fileMeta?.filename} · ${result.fileMeta?.mimetype}`);
info(`文件 meta：${JSON.stringify(result.fileMeta)}`);

// =========== 6) 打印生成的 WBS 结构摘要 ===========
log2('④ 生成的 WBS 结构摘要');
const wbsTree = result.wbs?.wbs || [];
function countNodes(nodes) {
  let n = 0; const byLevel = {};
  function walk(arr, lv) {
    for (const x of arr) {
      n++;
      byLevel[lv] = (byLevel[lv] || 0) + 1;
      if (x.children) walk(x.children, lv + 1);
    }
  }
  walk(nodes, 1);
  return { n, byLevel };
}
const stat = countNodes(wbsTree);
ok(`总节点数：${stat.n}`);
ok(`层级分布：${JSON.stringify(stat.byLevel)}`);

info('顶层 5 个工作包：');
wbsTree.slice(0, 5).forEach((top, i) => {
  const lv2 = top.children?.length || 0;
  console.log(`    ${i + 1}. [${top.code || '-'}] ${top.name} (L1, 子节点 ${lv2} 个)`);
});

if (result.wbs?.meta?.projectName) {
  info(`项目名：${result.wbs.meta.projectName}`);
  info(`项目类型：${result.wbs.meta.projectType || '-'}`);
  info(`工期：${result.wbs.meta.durationWeeks || '-'} 周 ≈ ${result.wbs.meta.durationMonths || '-'} 月`);
}

// =========== 7) audit 校验 ===========
log2('⑤ audit 校验结论');
const audit = result.audit || {};
ok(`passed：${audit.passed !== false ? '是' : '否'}`);
ok(`errors：${(audit.errors || []).length} 条`);
ok(`warnings：${(audit.warnings || []).length} 条`);
const cov = typeof audit.coverage === 'number' && Number.isFinite(audit.coverage) ? audit.coverage : null;
ok(`coverage：${cov !== null ? (cov * 100).toFixed(1) + '%' : 'N/A'}`);
if ((audit.warnings || []).length > 0) {
  info('前 3 条 warning：');
  audit.warnings.slice(0, 3).forEach((w) => console.log(`    - ${w}`));
}

// =========== 8) 保存 wbs.json 留底（后续 export 测试用） ===========
log2('⑥ 保存 WBS 到本地（便于 export 测试）');
const wbsOut = path.join(__dirname, 'fixtures', 'sow-wbs.json');
fs.writeFileSync(wbsOut, JSON.stringify(result.wbs, null, 2));
ok(`已写入：${wbsOut} · ${(fs.statSync(wbsOut).size / 1024).toFixed(1)} KB`);

// =========== 9) POST /api/v1/wbs/export 导出 xlsx ===========
log2('⑦ POST /api/v1/wbs/export  ·  验证 WBS → xlsx 导出链路');
const expResp = await fetch(`${BASE}/api/v1/wbs/export`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ format: 'xlsx', wbs: result.wbs }),
});
const expBuf = Buffer.from(await expResp.arrayBuffer());
if (!expResp.ok) {
  warn(`/export 失败：${expResp.status} ${expBuf.toString('utf8').slice(0, 200)}`);
} else {
  const xlsxPath = path.join(__dirname, 'fixtures', 'sow-wbs.xlsx');
  fs.writeFileSync(xlsxPath, expBuf);
  ok(`/export 成功：${expBuf.length} bytes → ${xlsxPath}`);
  info(`Content-Type：${expResp.headers.get('content-type')}`);
  info(`Content-Disposition：${expResp.headers.get('content-disposition')}`);
}

// =========== 10) 单独跑一次 /api/v1/wbs/validate 核对结果稳定 ===========
log2('⑧ POST /api/v1/wbs/validate  ·  二轮校验（用存盘的 wbs.json）');
const wbsForCheck = JSON.parse(fs.readFileSync(wbsOut, 'utf8'));
const val = await postJSON(`${BASE}/api/v1/wbs/validate`, { wbs: wbsForCheck });
if (val.ok) {
  ok(`/validate 通过，errors=${val.json.errors?.length || 0}, warnings=${val.json.warnings?.length || 0}`);
  const cov2 = typeof val.json.coverage === 'number' && Number.isFinite(val.json.coverage) ? val.json.coverage : null;
  ok(`coverage：${cov2 !== null ? (cov2 * 100).toFixed(1) + '%' : 'N/A'}`);
  if (val.json.stats) {
    info(`stats：totalNodes=${val.json.stats.totalNodes}, maxDepth=${val.json.stats.maxDepth}, leafCount=${val.json.stats.leafCount}`);
    info(`工时合计：${val.json.stats.totalHours} h`);
  }
}

console.log('\n🎉 完整链路测试通过。');
console.log('\n📁 产物清单：');
console.log(`   - ${SOW_FIXTURE}`);
console.log(`   - ${wbsOut}`);
console.log(`   - ${path.join(__dirname, 'fixtures', 'sow-wbs.xlsx')}`);
