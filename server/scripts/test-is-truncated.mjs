// 验证 isLikelyTruncatedText 的判定（直接复制函数）
function isLikelyTruncatedText(text) {
  if (!text) return false;
  const trimmed = String(text).trim();
  const last = trimmed[trimmed.length - 1];
  if (last !== '}' && last !== ']') return true;
  let o = 0, c = 0, a = 0, b = 0, inStr = false, esc = false;
  for (const ch of trimmed) {
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') o++;
    else if (ch === '}') c++;
    else if (ch === '[') a++;
    else if (ch === ']') b++;
  }
  if (o - c >= 2) return true;
  if (a - b >= 2) return true;
  return false;
}

const cases = [
  { text: '{"meta":{"client":"某金融机', expect: true, desc: '用户报错：截断在 value 中' },
  { text: '{"a":1,"b":[1,2,3]}', expect: false, desc: '完整 JSON' },
  { text: '{"a":1,"b":', expect: true, desc: '截断在 : 后' },
  { text: '{"a":[1,2,3', expect: true, desc: '数组缺 ]' },
  { text: '', expect: false, desc: '空' },
  { text: '{"a":1,"b":2，"', expect: true, desc: 'LLM 解释文字混入' },
];

for (const c of cases) {
  const r = isLikelyTruncatedText(c.text);
  const ok = r === c.expect;
  console.log(`${ok ? '✅' : '❌'} ${c.desc}: ${r} (期望 ${c.expect})`);
  if (!ok) console.log(`   文本: ${JSON.stringify(c.text)}`);
}