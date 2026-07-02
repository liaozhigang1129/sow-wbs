// 复现用户报错：截断在 "client":"某金融机
import { extractJSON, tryRepairTruncatedJSON } from '../src/services/llm.js';

const truncated = `{"meta":{"projectCode":"AMC-2024-OTMS","projectName":"资产托管运营智慧化管理系统建设项目","projectType":"Hybrid","client":"某金融机`;

console.log('=== 复现用户报错 ===');
console.log('截断文本长度:', truncated.length);
console.log('末尾 50 字符:', JSON.stringify(truncated.slice(-50)));

console.log('\n=== tryRepairTruncatedJSON ===');
const t0 = Date.now();
const r1 = tryRepairTruncatedJSON(truncated);
console.log('耗时:', Date.now() - t0, 'ms');
if (r1) {
  console.log('✅ 修补成功');
  console.log('  keys:', Object.keys(r1));
  console.log('  meta.client:', r1.meta?.client);
} else {
  console.log('❌ 修补失败');
}

console.log('\n=== extractJSON (内部会调 tryRepair) ===');
try {
  const t1 = Date.now();
  const r2 = extractJSON(truncated);
  console.log('✅ extractJSON 成功，耗时:', Date.now() - t1, 'ms');
  console.log('  keys:', Object.keys(r2));
} catch (e) {
  console.log('❌ extractJSON 抛出:', e.message.slice(0, 200));
}