import type { ProviderPreset } from '@shared/types';

/**
 * Registry of supported LLM providers.
 * All use the OpenAI-compatible /chat/completions interface.
 */
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'zhipu',
    label: 'Zhipu GLM (智谱)',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4', 'glm-4-flash', 'glm-4-long'],
    default_model: 'glm-4-plus',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: '智谱 API Key',
    docs_url: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4o-2024-11-20'],
    default_model: 'gpt-4o-mini',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    default_model: 'deepseek-chat',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'moonshot',
    label: 'Moonshot AI (月之暗面)',
    base_url: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    default_model: 'moonshot-v1-8k',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    label: 'Qwen (通义千问)',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen-long'],
    default_model: 'qwen-plus',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'ollama',
    label: 'Ollama (本地)',
    base_url: 'http://127.0.0.1:11434/v1',
    models: ['qwen2.5:7b', 'qwen2.5:14b', 'llama3.2', 'llama3.1', 'phi3'],
    default_model: 'qwen2.5:7b',
    key_required: false,
    key_label: '',
    key_placeholder: '无需密钥',
    docs_url: 'https://ollama.com/library',
  },
  {
    id: 'custom',
    label: '自定义 (Custom)',
    base_url: '',
    models: [],
    default_model: '',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'API Key (可选)',
    docs_url: '',
  },
];

/** Find a provider by id. */
export function getProvider(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
