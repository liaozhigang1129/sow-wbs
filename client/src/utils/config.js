// API Key & 配置管理（持久化到 localStorage）
import { WBS_CONFIG } from '../../../config/wbs-config.js';

const KEY = 'sow-wbs.llmConfig.v1';

export const DEFAULT_CONFIG = {
  provider: WBS_CONFIG.llm.provider,
  baseUrl: WBS_CONFIG.llm.baseUrl,
  apiKey: '',
  model: WBS_CONFIG.llm.model,
  temperature: WBS_CONFIG.llm.temperature,
  maxTokens: WBS_CONFIG.llm.maxTokens,
};

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}

// 预设模型列表
export const PROVIDER_PRESETS = {
  openai: {
    label: 'OpenAI 兼容 (OpenAI/DeepSeek/Moonshot/Qwen 等)',
    baseUrl: 'https://api.openai.com',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  claude: {
    label: 'Anthropic Claude（官方）',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  claude_hexai: {
    label: 'Claude Sonnet 4 (hexai 中转 / OpenAI 兼容)',
    baseUrl: 'https://crs.hexai.cn/api/v1',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  },
};