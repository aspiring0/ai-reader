import type { ProviderPreset } from '@shared/types';

/**
 * Registry of supported LLM providers.
 * All use the OpenAI-compatible /chat/completions interface.
 * Models are fetched dynamically from each provider's /models endpoint.
 */
export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'zhipu',
    label: 'Zhipu GLM (\u667A\u8C31)',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: '\u667A\u8C31 API Key',
    docs_url: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    base_url: 'https://api.deepseek.com/v1',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'moonshot',
    label: 'Moonshot AI (\u6708\u4E4B\u6697\u9762)',
    base_url: 'https://api.moonshot.cn/v1',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    label: 'Qwen (\u901A\u4E49\u5343\u95EE)',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'sk-...',
    docs_url: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'ollama',
    label: 'Ollama (\u672C\u5730)',
    base_url: 'http://127.0.0.1:11434/v1',
    key_required: false,
    key_label: '',
    key_placeholder: '\u65E0\u9700\u5BC6\u94A5',
    docs_url: 'https://ollama.com/library',
  },
  {
    id: 'custom',
    label: '\u81EA\u5B9A\u4E49 (Custom)',
    base_url: '',
    key_required: true,
    key_label: 'API Key',
    key_placeholder: 'API Key (\u53EF\u9009)',
    docs_url: '',
  },
];

/** Find a provider by id. */
export function getProvider(id: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
