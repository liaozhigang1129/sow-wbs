// /api/v1/openapi.json - OpenAPI 3.1 规范
// 手写而非动态生成 → 对外契约稳定、易于审阅
// ⭐ v2.19-d: 所有字段、补全中文 description
export function openapiJson() {
  const securitySchemes = {
    ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: '通过 X-API-Key 头部传入 API Key。推荐用于程序化调用。' },
    Bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque', description: '通过 Authorization: Bearer <key> 头部传入 API Key。OAuth/OIDC 风格集成常用。' },
  };

  const errorResp = {
    description: '错误响应',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
      },
    },
  };

  // ============ 共享响应 schema ============
  // 通用错误响应
  const ErrorSchema = {
    type: 'object',
    description: '统一错误响应结构。所有失败请求都返回此格式，便于客户端根据 code 做兜底。',
    properties: {
      error: {
        type: 'object',
        description: '错误详情',
        properties: {
          code: {
            type: 'string',
            description: '错误码（短字符串，蛇形命名），客户端可通过此字段做错误兜底。\n\n常见 code：\n- `bad_request` 请求体不合法\n- `missing_api_key` / `invalid_api_key` 鉴权失败\n- `sow_text_too_short` / `sow_text_too_large` SOW 文本长度不合规\n- `file_required` / `file_too_large` 文件缺失或过大\n- `wbs_required` / `format_invalid` 参数缺失或非法\n- `rate_limited` 触发限流\n- `internal_error` 服务器内部异常',
            example: 'sow_text_too_short',
          },
          message: {
            type: 'string',
            description: '面向开发者的错误描述（中文），可直接展示给用户。',
            example: 'sowText 不能为空，且长度需 ≥ 50 字符',
          },
          requestId: {
            type: 'string',
            description: '本次请求的服务端唯一 ID（与响应头 X-Request-Id 一致）。当用户反馈问题时，提供该值便于日志关联。',
            example: 'v1-a1b2c3d4',
          },
          details: {
            type: 'object',
            additionalProperties: true,
            description: '可选的额外错误上下文（如字段级校验失败列表）。结构按 code 不同而不同。',
          },
        },
        required: ['code', 'message'],
      },
    },
  };

  // SOW 文档抽取响应
  const ExtractResponseSchema = {
    type: 'object',
    description: 'SOW 文件解析结果。',
    properties: {
      text: {
        type: 'string',
        description: '抽取出的纯文本。可直接传入 `/api/v1/wbs/generate` 的 `sow_text` 字段。',
      },
      meta: {
        type: 'object',
        description: '文件级元信息（按文件类型字段不同）。docx/pdf/txt/md 公共字段为 pages/paragraphs/parseMs。',
        properties: {
          filename: { type: 'string', description: '原始文件名（来自上传时）' },
          mimetype: { type: 'string', description: 'MIME 类型' },
          pages: { type: 'integer', description: 'PDF 的页数（仅 PDF 有）' },
          paragraphs: { type: 'integer', description: '文档段落数（docx/md 有）' },
          parseMs: { type: 'integer', description: '抽取耗时（毫秒）' },
        },
      },
      paragraphs: {
        type: 'array',
        description: '段落数组（docx/md 文件才有），每项含 idx/text，用于后续基于段落号的精确定位。',
        items: { type: 'object' },
      },
      file: {
        type: 'object',
        description: '文件简要信息（不含 base64，避免大 payload）。',
        properties: {
          name: { type: 'string', description: '文件名' },
          size: { type: 'integer', description: '文件大小（字节）' },
          mimetype: { type: 'string', description: 'MIME 类型' },
        },
      },
    },
  };

  // WBS 节点（树形结构中的最小单元）
  const WBSTreeNodeSchema = {
    type: 'object',
    description:
      'WBS 树节点。从 L1（项目）到 L5（叶子任务）共用同一对象结构。\n\n**层级规则**：\n- L1（项目层）：1 个\n- L2（阶段层）：3-8 个\n- L3（工作包层）：每个 L2 下 3-10 个\n- L4（任务层）：每个 L3 下 2-8 个\n- L5（叶子任务）：每个 L4 下 2-6 个\n\n叶子节点（无 children）的标志：`children.length === 0` 或 `level === 5`。',
    properties: {
      id: {
        type: 'string',
        description: '节点稳定 ID。形式为父节点 ID + 数字段（如 `1.2.3`）。注意：根节点的 ID 仅为 `1`，L5 叶子通常用 `L5-N`。',
      },
      code: {
        type: 'string',
        description: '层级化编码。结构与 `id` 相同，但常用于 Excel 显示。可用于排序、引用关联。',
        example: '1.2.3',
      },
      name: {
        type: 'string',
        description: '节点名称（中文 PMO 习惯）。叶子节点推荐动宾结构（如"完成 XXX 接口设计"）。',
      },
      level: {
        type: 'integer',
        description: '节点层级，1-5 整数。1=项目，2=阶段，3=工作包，4=任务，5=叶子。',
        enum: [1, 2, 3, 4, 5],
      },
      estimatedHours: {
        type: 'number',
        description: '该节点估算工时（小时）。L2/L3 通常是子节点工时的汇总；L5 必填。',
        example: 20,
      },
      deliverable: {
        type: 'string',
        description: '节点交付物描述（L3 起建议填）。描述工作完成后"产出什么"。',
      },
      owner: {
        type: 'string',
        description: '责任角色。常用值：`PM/PMO`、`AR`（架构师）、`DEV`、`QA`、`OPS`、`BA`（业务分析）、`SA`（系统分析）。',
        example: 'DEV',
      },
      sowEvidence: {
        type: 'string',
        description: '对应到 SOW 中的章节或关键词（如"3.2 节｜RAG 检索、性能 SLA"）。用于节点 ↔ SOW 反向追溯。',
        example: '3.2 节｜RAG 检索、性能 SLA',
      },
      children: {
        type: 'array',
        description: '子节点数组。无子节点时为空数组（不是 null/undefined）',
        items: { $ref: '#/components/schemas/WBSTreeNode' },
      },
    },
    required: ['code', 'name', 'level'],
  };

  // WBS 对象（顶层）
  const WBSObjectSchema = {
    type: 'object',
    description: '完整的 WBS 数据对象。可以独立持久化、对比、版本管理。',
    properties: {
      meta: {
        type: 'object',
        description: '项目级元信息（命名、类型、工期、关键约束等）。导出文件时会用于填写页眉/标题。',
        properties: {
          projectName: { type: 'string', description: '项目名称' },
          projectCode: { type: 'string', description: '项目编号' },
          projectType: { type: 'string', description: '项目类型，如"预测型/Predictive"、"敏捷型/Agile"、"瀑布型/Waterfall"' },
          durationWeeks: { type: 'integer', description: '项目总工期（周）' },
          durationMonths: { type: 'integer', description: '项目总工期（月）' },
          deliverables: { type: 'array', items: { type: 'string' }, description: '项目关键交付物清单' },
          scopeBoundary: {
            type: 'object',
            description: '项目范围边界',
            properties: {
              inScope: { type: 'array', items: { type: 'string' }, description: '明确"做"' },
              outOfScope: { type: 'array', items: { type: 'string' }, description: '明确"不做"' },
            },
          },
          assumptions: { type: 'array', items: { type: 'string' }, description: '项目假设（前置条件）' },
          constraints: { type: 'array', items: { type: 'string' }, description: '项目约束（合规、可用性、SLA 等）' },
          stakeholders: {
            type: 'array',
            description: '关键干系人',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', description: '角色名称' },
                responsibility: { type: 'string', description: '职责描述' },
              },
            },
          },
          sowLength: { type: 'integer', description: '抽取出的 SOW 字符数' },
          detectedTheme: { type: 'string', description: '自动识别的主题（如"智能体"、"数据中台"）' },
        },
      },
      milestones: {
        type: 'array',
        description: '里程碑。独立于 wbs 树，用于甘特图 / 路线图渲染。',
        items: { $ref: '#/components/schemas/Milestone' },
      },
      wbs: {
        type: 'array',
        description: 'WBS 节点树。L1 节点数组。',
        items: { $ref: '#/components/schemas/WBSTreeNode' },
      },
    },
  };

  // 里程碑
  const MilestoneSchema = {
    type: 'object',
    description: '关键里程碑（与 wbs 节点独立，用于项目级别的时间管理）。',
    properties: {
      id: {
        type: 'string',
        description: '里程碑 ID，格式 `M1` / `M2` / ...',
        example: 'M3',
      },
      name: {
        type: 'string',
        description: '里程碑名称',
        example: '设计评审',
      },
      phase: {
        type: 'string',
        description: '所属阶段：启动 / 规划 / 执行 / 测试 / 部署 / 收尾',
        enum: ['启动', '规划', '执行', '测试', '部署', '收尾'],
      },
      weekOffset: {
        type: 'integer',
        description: '相对项目起始的周偏移（1 = 项目第 1 周）',
        example: 8,
      },
      deliverable: {
        type: 'string',
        description: '该里程碑的关键交付物',
      },
    },
  };

  // audit 校验结果
  const AuditSchema = {
    type: 'object',
    description: 'WBS 结构校验结果',
    properties: {
      errors: {
        type: 'array',
        description: '致命错误列表（需修复才能交付）。空数组表示无致命问题。',
        items: { type: 'string' },
      },
      warnings: {
        type: 'array',
        description: '警告列表（建议修订但可交付）。常见 warning：层级过深、L3 工作包只有 1 个子节点、工时与层级不匹配等。',
        items: { type: 'string' },
      },
      passed: {
        type: 'boolean',
        description: '整体是否通过校验（errors 为空即视为通过）',
      },
    },
  };

  // computeStats 统计结果
  const StatsSchema = {
    type: 'object',
    description: 'WBS 节点的纯统计结果（无 LLM 调用，瞬时返回）',
    properties: {
      totalNodes: { type: 'integer', description: '节点总数（含 L1-L5）', example: 175 },
      maxDepth: { type: 'integer', description: '最大层级深度（1-5）', example: 5 },
      leafCount: { type: 'integer', description: '叶子节点数（无 children 的节点）', example: 120 },
      totalHours: { type: 'number', description: '所有节点估算工时合计（小时）', example: 2440 },
      byLevel: {
        type: 'object',
        description: '按层级分组的节点数',
        additionalProperties: { type: 'integer' },
        example: { '1': 1, '2': 6, '3': 24, '4': 24, '5': 120 },
      },
      l1Count: { type: 'integer', description: 'L1 节点数（通常为 1）' },
      l2Count: { type: 'integer', description: 'L2 节点数（项目阶段数）' },
      l3Count: { type: 'integer', description: 'L3 节点数（工作包数）' },
    },
  };

  // ============ 主 spec ============
  return {
    openapi: '3.1.0',
    info: {
      title: 'SOW→WBS 公开 API',
      version: '1.0.0',
      description:
        '# SOW→WBS 公开 API v1\n\n' +
        '把 **SOW（Statement of Work，工作说明书）** 一键转成 **WBS（Work Breakdown Structure，工作分解结构）** 的 REST API。\n\n' +
        '## 主要能力\n' +
        '- **文件解析**：支持 `.docx` / `.pdf` / `.md` / `.txt`（最大 30 MB）\n' +
        '- **AI 生成**：从 SOW 文本智能生成 5 级 WBS（L1 项目 → L5 叶子任务）\n' +
        '- **结构校验**：错误/警告两级问题识别，覆盖率与 stats 统计\n' +
        '- **多格式导出**：xlsx / md / docx / json\n' +
        '- **自动降级**：无 LLM Key 时自动使用本地 mock 生成器，保证 demo 不中断\n\n' +
        '## 鉴权\n' +
        '- `Authorization: Bearer <key>` 或 `X-API-Key: <key>`\n' +
        '- 服务端通过环境变量 `WBS_API_KEYS` 配置允许的 Key（逗号分隔）\n' +
        '- 未配置时开发模式全开放\n\n' +
        '## 限流\n' +
        '- 默认每分钟 60 次 / Key（或 IP）\n' +
        '- 可通过 `WBS_RATE_LIMIT_PER_MIN` 调整\n' +
        '- 触发限流时返回 429，响应头 `Retry-After` 提示重试时间\n\n' +
        '## MCP 集成\n' +
        '同时提供 MCP Server（stdio + HTTP+SSE），Claude Desktop / Cursor / Dify 等可以直接接入。\n' +
        '详见 `/api/v1/mcp/info` 获取服务端点列表。\n',
    },
    servers: [
      { url: 'http://localhost:8787/api/v1', description: '本地开发' },
    ],
    components: {
      securitySchemes,
      schemas: {
        Error: ErrorSchema,
        ExtractResponse: ExtractResponseSchema,
        WBSObject: WBSObjectSchema,
        WBSTreeNode: WBSTreeNodeSchema,
        Milestone: MilestoneSchema,
        Audit: AuditSchema,
        Stats: StatsSchema,

        // 请求体 schema
        WBSGenerateRequest: {
          type: 'object',
          required: ['sow_text'],
          description: 'WBS 生成请求',
          properties: {
            sow_text: {
              type: 'string',
              minLength: 50,
              maxLength: 500000,
              description:
                'SOW 全文。最少 50 字符、最多 50 万字符。\n\n' +
                '建议直接传 `extract` 端点返回的 `text` 字段，避免二次解析。',
            },
            llm_config: {
              type: 'object',
              description:
                '**可选**。本服务对 LLM 调用**两种模式并存**：\n\n' +
                '- **默认（推荐）—— "用系统提供的 LLM"**：整个字段不传，或只传 `provider` / `model`。服务会自动从环境变量读取 **baseUrl + apiKey** 的优先级链：`HEXAI_BASE_URL` / `HEXAI_API_KEY` → `LLM_CLAUDE_BASE_URL` / `LLM_CLAUDE_API_KEY` → `LLM_OPENAI_BASE_URL` / `LLM_OPENAI_API_KEY` → 内置默认（claude_hexai）。\n' +
                '- **覆盖模式 —— "调用方自带 Key"**：当你想用 **自己的模型 / 私部署 / 测试用三方 Key** 时，把所有四项都传进来，本次请求就完全用入参的地址和 Key，而服务端 `.env` 不会被读到，也**不会泄露**到日志中。\n\n' +
                '当服务端环境变量里 `HEXAI_API_KEY` 也没有时，会**自动降级到 mock 生成本地 WBS**，响应中 `mock: true` + `degraded: true` 标识。该降级保证 demo 流程不断，但生成质量固定。',
              properties: {
                provider: {
                  type: 'string',
                  enum: ['openai', 'claude', 'claude_hexai'],
                  description:
                    '**可选**。LLM 提供商。`claude_hexai` 指本项目私有部署的 Claude 兼容服务（推荐）。\n\n' +
                    '缺省时按入参 `model` 名字猜：含 `gpt`/`o4`/`deepseek`/`qwen` → `openai`；含 `claude` → `claude`。完全无法识别则 `claude_hexai`。',
                  example: 'claude_hexai',
                },
                model: {
                  type: 'string',
                  description:
                    '**可选**。模型名称。常见示例：\n' +
                    '- `claude-3-5-sonnet`（推荐）\n' +
                    '- `gpt-4o`\n' +
                    '- `Qwen2.5-14B-Chat`\n\n' +
                    '缺省时使用环境变量对应的默认模型。',
                  example: 'claude-3-5-sonnet',
                },
                baseUrl: {
                  type: 'string',
                  description:
                    '**可选**。API 基础地址。**只在你想覆盖服务端默认值时才需要传**，比如：\n' +
                    '- 调用方想直连 `https://api.openai.com/v1`（绕过服务端 env）\n' +
                    '- 调用方有自己的中转代理\n' +
                    '- 多租户共用一套服务端但各自走不同模型网关\n\n' +
                    '缺省（最常见）→ 服务端 env `HEXAI_BASE_URL` → 都没有则内置默认 `https://crs.hexai.cn/v1`（claude_hexai）。',
                  example: 'https://api.openai.com/v1',
                },
                apiKey: {
                  type: 'string',
                  description:
                    '**可选**。仅当你想用自己的 Key 时才需要传。\n\n' +
                    '缺省（最常见，**也是最安全的用法**）→ 服务端 env `HEXAI_API_KEY` → 都没有则降级 mock。**Key 不会回显到任何响应、日志、swagger UI**。',
                },
              },
            },
            options: {
              type: 'object',
              description: '生成行为参数',
              properties: {
                promptMode: {
                  type: 'string',
                  enum: ['strict', 'flexible'],
                  default: 'flexible',
                  description:
                    'Prompt 风格：\n- `strict` 严格使用 PMO 术语与命名规范\n- `flexible` 允许 LLM 自主命名，更贴合业务\n\n默认 `flexible`',
                },
                enableL4L5: {
                  type: 'boolean',
                  default: true,
                  description: '是否展开到 L4/L5 细节。`true` = 完整 5 级（≈20s 完成）；`false` 仅到 L3（≈5s）',
                },
                enableCache: {
                  type: 'boolean',
                  default: true,
                  description: '是否启用结果缓存（基于 SOW hash + 模型 key，30 分钟 TTL）。同一份 SOW 命中直接返回。',
                },
              },
            },
          },
        },

        // 响应 schema
        WBSResponse: {
          type: 'object',
          description: 'WBS 生成/auto 响应。',
          properties: {
            wbs: { $ref: '#/components/schemas/WBSObject', description: '完整 WBS 对象（含 meta、milestones、wbs 节点树）' },
            audit: { $ref: '#/components/schemas/Audit', description: '校验结果' },
            log: {
              type: 'array',
              description: '生成过程日志（仅开发态有用，可选消费）',
              items: {
                type: 'object',
                properties: {
                  stage: { type: 'string', description: '阶段标识，如 skeleton/expand/validate' },
                  level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
                  msg: { type: 'string', description: '日志消息' },
                  ts: { type: 'string', description: '时间戳' },
                },
              },
            },
            meta: {
              type: 'object',
              description: '生成上下文元信息',
              properties: {
                provider: { type: 'string', description: '实际使用的 LLM 提供商（mock / claude_hexai ...）' },
                model: { type: 'string', description: '实际使用的模型' },
                elapsedMs: { type: 'integer', description: '生成总耗时（毫秒）' },
                cacheHit: { type: 'boolean', description: '是否命中缓存' },
              },
            },
            mock: {
              type: 'boolean',
              description: '本次结果是否来自 mock 生成器（true = mock，false = 真实 LLM）',
            },
            degraded: {
              type: 'boolean',
              description: '本次结果是否经过降级路径（true = 降级）',
            },
            degradedReason: {
              type: 'string',
              description: '降级原因（如"无 API Key"）',
            },
          },
        },

        // validate 响应 schema（audit + stats）
        WBSValidateResponse: {
          type: 'object',
          description: 'WBS 校验响应',
          properties: {
            errors: { type: 'array', items: { type: 'string' }, description: '错误列表' },
            warnings: { type: 'array', items: { type: 'string' }, description: '警告列表' },
            passed: { type: 'boolean', description: '是否通过校验' },
            stats: { $ref: '#/components/schemas/Stats', description: '统计信息' },
          },
        },
      },
    },
    security: [{ ApiKey: [] }, { Bearer: [] }],
    tags: [
      { name: 'meta', description: '元信息接口（无需鉴权）' },
      { name: 'extract', description: 'SOW 文件抽取' },
      { name: 'generate', description: 'WBS 生成与校验' },
      { name: 'export', description: 'WBS 多格式导出' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['meta'],
          summary: '健康检查',
          description: '检查服务是否存活，返回当前服务时间。',
          security: [],
          responses: { 200: { description: '服务存活', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, service: { type: 'string', example: 'sow-wbs-api' }, time: { type: 'string', format: 'date-time', example: '2026-07-06T14:24:23.793Z' }, api_version: { type: 'string', example: 'v1' } } } } } } },
        },
      },
      '/version': {
        get: {
          tags: ['meta'],
          summary: '版本信息',
          description: '返回 API 版本与服务版本。',
          security: [],
          responses: { 200: { description: '版本信息' } },
        },
      },
      '/openapi.json': {
        get: {
          tags: ['meta'],
          summary: 'OpenAPI 规范 JSON',
          description: '返回本规范 JSON（自我描述）。',
          security: [],
          responses: { 200: { description: 'OpenAPI 3.1 JSON' } },
        },
      },
      '/docs': {
        get: {
          tags: ['meta'],
          summary: 'Swagger UI 文档',
          description: '浏览器友好的 API 文档页（基于 Swagger UI CDN）。',
          security: [],
          responses: { 200: { description: 'HTML 文档页', content: { 'text/html': {} } } },
        },
      },
      '/sow/extract': {
        post: {
          tags: ['extract'],
          summary: '提取 SOW 文本（multipart/form-data）',
          description:
            '上传 .docx / .pdf / .txt / .md 文件，返回抽取出的纯文本与元信息。\n\n' +
            '**MIME 类型规则**：缺省时按文件名后缀推断（`docx→application/vnd.openxmlformats-officedocument.wordprocessingml.document` 等）。\n\n' +
            '**大小限制**：30 MB（已大于等于 .env 配置）。',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'SOW 文件',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '解析成功',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtractResponse' } } },
            },
            400: errorResp,
            413: errorResp,
          },
        },
      },
      '/sow/extract/base64': {
        post: {
          tags: ['extract'],
          summary: '提取 SOW 文本（base64 JSON 形式）',
          description: '适合程序化调用（外部 Agent / MCP / Coze）：把文件以 base64 字符串传入。',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file_base64', 'filename'],
                  description: '提取请求体',
                  properties: {
                    file_base64: {
                      type: 'string',
                      description: '文件的 base64 编码字符串（不含 `data:` URI 前缀）',
                    },
                    filename: {
                      type: 'string',
                      description: '原始文件名（用于推断文件类型，如 `sow.docx`）',
                      example: 'sow.docx',
                    },
                    mime_type: {
                      type: 'string',
                      description: '可选的 MIME 类型。缺省按文件名后缀推断',
                      example: 'application/pdf',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '解析成功',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtractResponse' } } },
            },
            400: errorResp,
            413: errorResp,
          },
        },
      },
      '/wbs/generate': {
        post: {
          tags: ['generate'],
          summary: '从 SOW 文本生成 WBS',
          description:
            '核心接口之一：接收 SOW 全文 + LLM 配置，返回完整 WBS。\n\n' +
            '**与 `/api/v1/wbs/auto` 的区别**：本接口接收已抽取好的 SOW 文本。适合客户端分阶段调用的场景。\n\n' +
            '**降级策略**：若 `llm_config.apiKey` 缺省且服务端环境变量也无 Key，自动降级到 mock 生成器。响应中 `mock: true` 与 `degraded: true` 标识。',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WBSGenerateRequest' } } },
          },
          responses: {
            200: {
              description: '生成成功',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/WBSResponse' } } },
            },
            400: errorResp,
            401: errorResp,
            429: errorResp,
            500: errorResp,
          },
        },
      },
      '/wbs/auto': {
        post: {
          tags: ['generate'],
          summary: 'SOW 文件 → WBS 一步到位',
          description:
            '最便捷的接口：上传 SOW 文件，直接得到 WBS JSON。\n\n' +
            '等价于：`/api/v1/sow/extract/base64` + `/api/v1/wbs/generate` 两步串联，但只发一次 HTTP 请求。\n\n' +
            '**响应字段差异**：返回中除了 WBS，还会带 `text` / `paragraphs` / `fileMeta` 供调试或后续使用。\n\n' +
            '**关于 `llm_config` 字段**：本字段**完全可选**。**不传**是常规用法，意味着"用服务端 `.env` 提供的 LLM"。\n' +
            '- 如果服务端 env 已经配好 `HEXAI_API_KEY` 等，自动调用真实模型。\n' +
            '- 如果服务端 env 也没配，自动降级到 mock（响应里 `mock: true` + `degraded: true`），流程不会中断。\n' +
            '- 只有当你需要【用别的模型 / 直连 OpenAI / 用自己的代理】时，才需要把 `provider`/`model`/`baseUrl`/`apiKey` 都传进来。',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['file_base64', 'filename'],
                  description: 'auto 请求体',
                  properties: {
                    file_base64: { type: 'string', description: '文件 base64 字符串' },
                    filename: { type: 'string', description: '文件名（用于推断类型）', example: 'sow.docx' },
                    mime_type: { type: 'string', description: '可选 MIME 类型' },
                    llm_config: { $ref: '#/components/schemas/WBSGenerateRequest/properties/llm_config' },
                    options: { $ref: '#/components/schemas/WBSGenerateRequest/properties/options' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '生成成功，响应体比 `/wbs/generate` 多 text/paragraphs/fileMeta',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/WBSResponse' },
                      {
                        type: 'object',
                        properties: {
                          text: { type: 'string', description: '抽取出的 SOW 文本（与 extract 端点返回一致）' },
                          paragraphs: { type: 'array', items: { type: 'object' }, description: '段落数组（docx/md 才有）' },
                          fileMeta: {
                            type: 'object',
                            description: '文件元信息',
                            properties: {
                              filename: { type: 'string' },
                              mimetype: { type: 'string' },
                              parseMs: { type: 'integer', description: '抽取耗时（毫秒）' },
                              pages: { type: 'integer', description: '页数（仅 PDF）' },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            400: errorResp,
            413: errorResp,
          },
        },
      },
      '/wbs/validate': {
        post: {
          tags: ['generate'],
          summary: '校验 WBS 结构',
          description: '检查 WBS 节点的完整性、层级、命名规范等。返回错误与警告列表 + 节点统计。',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['wbs'],
                  description: 'validate 请求体',
                  properties: {
                    wbs: {
                      $ref: '#/components/schemas/WBSObject',
                      description: '待校验的 WBS 对象',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '校验完成',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/WBSValidateResponse' } } },
            },
            400: errorResp,
          },
        },
      },
      '/wbs/export': {
        post: {
          tags: ['export'],
          summary: '导出 WBS 为文件',
          description:
            '导出为 4 种格式之一：\n' +
            '- `xlsx` Excel 表格（适合项目管理）\n' +
            '- `md` Markdown 文档（适合 Wiki / Git）\n' +
            '- `docx` Word 文档（适合 PMO 交接）\n' +
            '- `json` 原 JSON（适合二次处理）\n\n' +
            '返回二进制流，Content-Disposition 携带文件名。',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['format', 'wbs'],
                  description: 'export 请求体',
                  properties: {
                    format: {
                      type: 'string',
                      enum: ['xlsx', 'md', 'docx', 'json'],
                      description: '导出格式',
                    },
                    wbs: {
                      $ref: '#/components/schemas/WBSObject',
                      description: '待导出的 WBS 对象',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: '文件二进制流（Content-Disposition 携带文件名）',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } },
                'text/markdown': { schema: { type: 'string' } },
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { schema: { type: 'string', format: 'binary' } },
                'application/json': { schema: { type: 'string' } },
              },
              headers: {
                'Content-Disposition': {
                  schema: { type: 'string' },
                  description: '例如：`attachment; filename="wbs.xlsx"`',
                },
              },
            },
            400: errorResp,
          },
        },
      },
      '/skill/list': {
        get: {
          tags: ['meta'],
          summary: '列出 PMO Skill 模板',
          description:
            '返回服务端注册的 3 个 PMO Skill（wbs-skeleton-prompt / wbs-l4l5-prompt / wbs-master-prompt）及其适用阶段、触发规则、提示。\n\n' +
            '适合场景：\n' +
            '1. 让外部 LLM 浏览器型地知晓本服务有几个 prompt 模板可选\n' +
            '2. 用户想了解"wbsGenerate 内部按什么规则挑模板"\n' +
            '3. 浏览器手测每个 skill 的元信息\n\n' +
            '通常 `wbs_generate` 会自动按 SOW 长度选最合适的 skill。本接口主要用于「skill 全景浏览」。',
          parameters: [
            {
              name: 'stage',
              in: 'query',
              description: '按阶段过滤（all=全部 / skeleton=阶段1 / l4l5=阶段2 / master=单次/回退）',
              schema: { type: 'string', enum: ['all', 'skeleton', 'l4l5', 'master'], default: 'all' },
            },
          ],
          responses: {
            200: { description: 'skill 元信息列表' },
            401: errorResp,
            429: errorResp,
          },
        },
      },
      '/skill/read': {
        get: {
          tags: ['meta'],
          summary: '读取 PMO Skill 模板正文',
          description:
            '读出 `wbs-skeleton-prompt` / `wbs-l4l5-prompt` / `wbs-master-prompt` 中某一个的完整 Markdown 文本。\n\n' +
            'maxChars=0（默认）=全文；>0=截断前 N 字符（含 [TRUNCATED] 提示）。',
          parameters: [
            {
              name: 'skill_id',
              in: 'query',
              required: true,
              description: 'skill 标识符，从 `/skill/list` 返回的 id 字段复制',
              example: 'wbs-skeleton-prompt',
            },
            {
              name: 'max_chars',
              in: 'query',
              description: '正文最大字符数；0=全文',
              schema: { type: 'integer', minimum: 0, maximum: 60000, default: 0 },
            },
            {
              name: 'include_metadata',
              in: 'query',
              description: '是否同时返回 stage/appliesWhen/notes',
              schema: { type: 'boolean', default: true },
            },
          ],
          responses: {
            200: { description: 'skill 正文 + 元信息' },
            400: errorResp,
            404: errorResp,
          },
        },
      },
    },
  };
}
