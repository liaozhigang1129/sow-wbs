// 调试：打印 tryRepair 内部状态
const truncated = `{"meta":{},"wbs":[{"id":"WBS-1","code":"1","name":"启动阶段","children":[{"id":"WBS-1.1","code":"1.1","name`;

let body = truncated.trim();
const start = body.indexOf('{');
body = body.slice(start);

let inStr = false;
let escape = false;
let ctx = 'O';
const stack = [];
let afterColon = false;

for (let i = 0; i < body.length; i++) {
  const c = body[i];
  if (inStr) {
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') inStr = false;
    continue;
  }
  if (/\s/.test(c)) continue;
  if (c === '"') { inStr = true; afterColon = false; continue; }
  if (c === '{') { stack.push('O'); continue; }
  if (c === '[') { stack.push('A'); continue; }
  if (c === '}' || c === ']') {
    if (stack.length) stack.pop();
    continue;
  }
  if (c === ':') { afterColon = true; continue; }
  if (c === ',') { afterColon = false; continue; }
  afterColon = false;
}

console.log('=== 修补状态机诊断 ===');
console.log('inStr:', inStr);
console.log('afterColon:', afterColon);
console.log('stack (从底到顶):', stack);
console.log('stack.length:', stack.length);
console.log('期望闭合 (反序):', stack.slice().reverse().map(c => c === 'O' ? '}' : ']').join(''));

let prefix = body;
if (inStr) prefix += '"';
else if (afterColon) prefix += 'null';
const closing = stack.slice().reverse().map(c => c === 'O' ? '}' : ']').join('');
const repaired = prefix + closing;
console.log('\n=== 修补结果 ===');
console.log('repaired:', repaired);
console.log('repaired 长度:', repaired.length);

try {
  const j = JSON.parse(repaired);
  console.log('✅ JSON.parse 成功');
  console.log('keys:', Object.keys(j));
} catch (e) {
  console.log('❌ JSON.parse 失败:', e.message);
  console.log('失败位置:', e.message.match(/position (\d+)/)?.[1]);
}
