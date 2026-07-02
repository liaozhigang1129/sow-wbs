// SOW → WBS 系统后端入口
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

import generateRouter from './routes/generate.js';
import uploadRouter from './routes/upload.js';
import exportRouter from './routes/export.js';
import validateRouter from './routes/validate.js';
import testLLMRouter from './routes/testLLM.js';
import mockGenerateRouter from './routes/mockGenerate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'dist');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/upload', uploadRouter);
app.use('/api/generate', generateRouter);
app.use('/api/validate', validateRouter);
app.use('/api/export', exportRouter);
app.use('/api/test-llm', testLLMRouter);
app.use('/api/mock-generate', mockGenerateRouter);

// 托管前端构建产物
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send(
      '<h1>SOW→WBS 后端已启动</h1><p>前端未构建。请先运行 <code>npm run build:client</code> 或开发模式 <code>npm run dev</code></p>',
    );
  });
}

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 SOW→WBS Server ready at http://${HOST}:${PORT}`);
  console.log(`   Health:    http://${HOST}:${PORT}/api/health`);
  console.log(`   Upload:    POST /api/upload`);
  console.log(`   Generate:  POST /api/generate`);
  console.log(`   Validate:  POST /api/validate`);
  console.log(`   Export:    POST /api/export  (xlsx | md | docx | json)`);
  console.log(`   Test LLM:  POST /api/test-llm\n`);
});