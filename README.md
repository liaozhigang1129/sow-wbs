# SOW → WBS 工作分解系统

> 基于 **WBS Master Prompt v2.3** 的智能 WBS 分解 Web 系统。
> 导入 SOW（Word/PDF/文本/Markdown）→ AI 自动生成 MECE 工作分解结构 → 工时守恒 + 命名规范自动校验 → 多格式导出。

## ✨ 核心能力

- **多格式 SOW 导入**：`.docx` / `.pdf` / `.txt` / `.md`
- **多厂商大模型适配**：OpenAI 兼容（OpenAI/DeepSeek/Moonshot/Qwen 等）、Anthropic Claude
- **遵循 WBS Master Prompt v2.3**：
  - 行业识别 + 3 个核心证据
  - 里程碑切分（瀑布 → 敏捷 Sprint → 验收上线）
  - 多层级（L1-L5）+ 工时触发条件
  - **工时守恒**：父节点 = Σ 子节点（误差 0h）
  - **命名规范**：禁止动作动词，推荐交付物/过程/阶段名词
  - 风险列表（10-15 条，CRITICAL/HIGH/MEDIUM/LOW）
  - SOW 章节 100% 覆盖
- **自动校验 + 自愈**：输出不合规时自动让模型修复一次
- **多格式导出**：Excel (xlsx) / Word (docx) / Markdown / JSON

## 📁 项目结构

```
SOW_WBS/
├── server/                    # Express 后端
│   ├── src/
│   │   ├── index.js           # 服务入口
│   │   ├── routes/            # /api/upload /generate /validate /export
│   │   ├── services/
│   │   │   ├── llm.js         # 多厂商 LLM 适配器
│   │   │   └── wbsService.js  # WBS 生成 + 自愈
│   │   ├── utils/
│   │   │   ├── parser.js      # 文档解析
│   │   │   ├── validator.js   # 工时守恒 + 命名校验
│   │   │   └── exporter.js    # 多格式导出
│   │   └── prompts/
│   │       └── wbs-master-prompt.md  # v2.3 Prompt
│   └── package.json
├── client/                    # React + Vite + Tailwind 前端
│   ├── src/
│   │   ├── App.jsx            # 主界面
│   │   ├── components/        # WBSTree / MetaPanel / AIConfig
│   │   └── utils/             # api / config
│   └── tailwind.config.cjs
├── dist/                      # 前端构建产物（被 server 静态托管）
├── public/                    # 静态资源
└── package.json
```

## 🚀 快速启动

### 1. 安装依赖

```bash
npm install
cd client && npm install && cd ..
```

### 2. 开发模式（前后端分离 + 热更新）

```bash
# 终端 1：启动后端 (http://localhost:8787)
npm run dev:server

# 终端 2：启动前端 (http://localhost:5173)
npm run dev:client

# 或一键启动（同时运行）
npm run dev
```

开发模式下，访问 http://localhost:5173 即可（前端自带 `/api` 代理到 8787）。

### 3. 生产构建 + 一体化部署

```bash
npm run build:client      # 构建前端到 dist/
npm start                 # Express 同时托管 API + 静态资源（端口 8787）
```

访问 http://localhost:8787

### 4. 配置 AI

打开页面右上角 **⚙️ AI 配置**，选择厂商、填写：
- **OpenAI 兼容**：`baseUrl=https://api.openai.com`、`model=gpt-4o`、API Key
- **Claude**：`baseUrl=https://api.anthropic.com`、`model=claude-3-5-sonnet-20241022`、API Key
- **DeepSeek**：`baseUrl=https://api.deepseek.com`、`model=deepseek-chat`、API Key
- **国内兼容**：可填 `https://dashscope.aliyuncs.com`（通义）/ `https://api.moonshot.cn`（Kimi）等

> API Key 仅保存在浏览器 localStorage，不上传服务器。

## 📡 API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `POST` | `/api/upload` | 上传 SOW 文件 → 返回纯文本 |
| `POST` | `/api/generate` | 调用 LLM 生成 WBS |
| `POST` | `/api/validate` | 校验 WBS JSON |
| `POST` | `/api/export` | 导出 xlsx/md/docx/json |

## 📋 使用流程

1. **导入 SOW**：拖入 `.docx`/`.pdf`/`.txt`/`.md` 或直接粘贴文本
2. **生成 WBS**：点击 "🚀 开始生成 WBS"（1-3 分钟）
3. **查看结果**：
   - 左侧：项目 Meta、行业识别证据、风险列表、待澄清项
   - 右侧：层级 WBS 树状结构（可展开/折叠）
4. **导出**：选择 Excel / Markdown / Word / JSON

## 🔍 校验规则

系统会对生成的 WBS 做两类自动校验：

### 1. 工时守恒
- 每个父节点工时 = Σ 子节点工时（误差 0h）
- 各层级总工时必须一致
- 触发条件：L2 ≥40h 必须有 L3；L3 ≥24h 必须有 L4；L4 ≥16h 必须有 L5

### 2. 命名规范
- ❌ 禁止动作指令型动词："编写 / 整理 / 实现 / 去 / 搭建 / 做"
- ✅ 推荐交付物名词："报告 / 文档 / 服务 / 脚本 / 模型 / 纪要 / 方案 / 适配器"
- ✅ 接受过程名词："数据迁移 / 系统集成测试 / UAT / 灰度发布"
- ✅ 接受阶段名词："立项 / 基线 / 选型 / 演示 / 部署"

若校验失败，系统会**自动调用一次 LLM 进行修复**。

## 🛠 技术栈

- **后端**：Node.js + Express + Multer + mammoth (docx) + pdf-parse
- **前端**：React 18 + Vite + TailwindCSS
- **AI**：OpenAI 兼容 API + Anthropic Claude
- **导出**：ExcelJS (xlsx) + docx (Word)

## 📝 提示词

提示词文件位于 [server/src/prompts/wbs-master-prompt.md](server/src/prompts/wbs-master-prompt.md)，源自：
`~/.hermes/skills/pmo-wbs-generator/prompts/wbs-master-prompt.md`

修改后重启服务即可生效。

## ⚙️ 环境变量

在项目根目录创建 `.env`：

```bash
PORT=8787
HOST=0.0.0.0
```

API Key 由前端管理，不需要在 `.env` 中配置。

## 📜 License

MIT