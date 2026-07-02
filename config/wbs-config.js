// WBS 生成系统的核心配置（前后端共用）
// 任何修改都会立即生效；新增参数请保持向后兼容

export const WBS_CONFIG = {
  // LLM 生成参数
  llm: {
    provider: 'claude_hexai',                    // ⭐ 已切换：Claude Sonnet 4 via hexai 中转
    baseUrl: 'https://crs.hexai.cn/api/v1',     // hexai 中转 (OpenAI 兼容协议 + /v1)
    model: 'claude-sonnet-4-20250514',           // Claude Sonnet 4
    temperature: 0,                              // 0 = 最稳定
    maxTokens: 8000,                             // ⭐ v2.11 关键修复：Claude Sonnet 4 上限是 8192，留 buffer 防止超限被截断
    timeoutMs: 240000,                           // 单次 LLM 调用超时（4 分钟）
  },

  // WBS 命名规范（与 prompt 保持一致）
  wbs: {
    maxLevels: 5,                                // ⭐ 提升到 5 层
    estimatedHoursRange: [4, 240],               // ⭐ v2.9：L4-L5 叶子节点合理区间（L2/L3 单独规则）
    l3HoursWarning: 80,                          // ⭐ v2.9 新增：L3 > 80h 警告阈值
    l3HoursError: 160,                           // ⭐ v2.9 新增：L3 > 160h 错误阈值（强制分解）
    l2HoursWarning: 240,                         // ⭐ v2.9 新增：L2 > 240h 警告阈值
    l2HoursError: 320,                           // ⭐ v2.9 新增：L2 > 320h 错误阈值
    totalNodesBudget: 200,                       // ⭐ v2.7 提升：支持大型 SOW（167+ 功能项全覆盖）
    leafNodesBudget: 120,                        // ⭐ v2.7 提升：叶子节点预算翻倍
    requireSowEvidence: true,                    // 非管理类节点必须填 sowEvidence
    codeFormat: /^\d+(\.\d+)*$/,                 // 编码格式：1, 1.1, 1.1.1
    minDepthRequired: 4,                         // ⭐ 新增：要求至少生成到 L4
  },

  // 提示词版本与文件
  prompt: {
    version: 'v2.9',                             // ⭐ v2.9：L3 工作包大小规则强化（80h 警告/160h 强制）
    path: 'src/prompts/wbs-master-prompt.md',    // 服务端加载路径
    placeholder: '{{SOW_TEXT}}',                 // SOW 注入占位符
    maxOutputChars: 15000,                       // ⭐ v2.7 提升：大型 SOW 需要更大输出预算
  },

  // JSON 修补策略（与 llm.js 同步）
  jsonRepair: {
    enableAutoRetry: true,                       // 解析失败自动重试
    maxRetries: 2,
    repairStateMachine: true,                    // 状态机修补
    aggressiveRepair: true,                      // 暴力剥除末尾杂物
    continueOnTruncation: true,                  // 截断时续写数组
  },

  // 校验规则（与 validator.js 同步）
  validation: {
    requireLifecyclePhases: true,                // 必含生命周期阶段
    minLifecyclePhases: 4,
    requireMilestones: true,
    minMilestones: 1,
    requireRequirements: true,
    minRequirements: 1,
    requireRtm: true,
    requireMetaDurationWeeks: true,              // ⭐ 新增：meta.durationWeeks 必填
    requireMetaProjectCode: true,
    hoursTolerance: 0.2,                         // 工时守恒容差 ±20%
  },
};

// 默认 LLM 参数（用于用户没指定时的回退）
export const DEFAULT_LLM_PARAMS = {
  maxTokens: WBS_CONFIG.llm.maxTokens,
  temperature: WBS_CONFIG.llm.temperature,
  timeoutMs: WBS_CONFIG.llm.timeoutMs,
};

// 模型预设（与 client/src/utils/config.js 同步）
export const LLM_PRESETS = {
  openai: {
    label: 'OpenAI 兼容 (OpenAI/DeepSeek/Moonshot/Qwen)',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'qwen-plus', 'deepseek-chat', 'moonshot-v1-128k'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
  },
  claude: {
    label: 'Anthropic Claude（官方）',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultBaseUrl: 'https://api.anthropic.com',
  },
  claude_hexai: {
    label: 'Claude Sonnet 4 (hexai 中转 / OpenAI 兼容)',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
    defaultBaseUrl: 'https://crs.hexai.cn/api/v1',
  },
  deepseek: {
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
};

// 默认导出（用于运行时读取）
export default WBS_CONFIG;
