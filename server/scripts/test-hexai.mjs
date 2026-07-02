// 实测 hexai 接口（先用最小 ping）
const HEXAI_URL = 'https://crs.hexai.cn/api/v1';

const apiKey = process.env.HEXAI_API_KEY;
if (!apiKey) {
  console.log('❌ HEXAI_API_KEY 环境变量未设置');
  console.log('   请设置: export HEXAI_API_KEY=sk-hexai-xxx');
  process.exit(1);
}
console.log('✅ HEXAI_API_KEY length:', apiKey.length);

// 测试 1: 列模型（部分中转支持 GET /v1/models）
console.log('\n=== 测试 1: GET /v1/models ===');
try {
  const r1 = await fetch(`${HEXAI_URL}/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  console.log(`HTTP ${r1.status}`);
  if (r1.ok) {
    const j = await r1.json();
    console.log('返回模型数:', j.data?.length || j.models?.length || '?');
    if (j.data) j.data.slice(0, 10).forEach((m) => console.log(' -', m.id));
  } else {
    console.log('Body:', (await r1.text()).slice(0, 300));
  }
} catch (e) {
  console.log('❌ ERR:', e.message);
}

// 测试 2: 最小 chat 调用
console.log('\n=== 测试 2: POST /v1/chat/completions (ping) ===');
try {
  const r2 = await fetch(`${HEXAI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: '回复"pong"即可，不要任何其他内容' }],
      max_tokens: 20,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(90000),
  });
  console.log(`HTTP ${r2.status}`);
  const text = await r2.text();
  console.log('Body:', text.slice(0, 800));
  try {
    const j = JSON.parse(text);
    if (j.choices?.[0]?.message?.content) {
      console.log('\n✅ 响应内容:', j.choices[0].message.content);
    }
    if (j.usage) console.log('Usage:', j.usage);
  } catch {}
} catch (e) {
  console.log('❌ ERR:', e.message);
}