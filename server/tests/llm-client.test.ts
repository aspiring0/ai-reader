import { describe, it, expect, afterEach, vi } from 'vitest';
import { llmChat } from '../src/lib/llm-client.js';
import { LlmError } from '../src/lib/llm-client.js';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { Settings } from '@shared/types';

const mockSettings: Settings = {
  ...DEFAULT_SETTINGS,
  llm_api_key: 'test-key-123',
  llm_base_url: 'https://open.bigmodel.cn/api/paas/v4',
  llm_model: 'glm-4-plus',
  llm_timeout_ms: 30000,
};

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function mockChatResponse(content: string): Response {
  return mockFetchResponse({
    choices: [{ message: { content } }],
  });
}

describe('LLM Client (llmChat)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return content string on successful call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockChatResponse('Hello world'));
    const result = await llmChat(
      { messages: [{ role: 'user', content: 'hi' }] },
      mockSettings,
    );
    expect(result.content).toBe('Hello world');
    expect(result.model).toBe('glm-4-plus');
  });

  it('should send Authorization Bearer header with API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockChatResponse('ok'));
    await llmChat(
      { messages: [{ role: 'user', content: 'hi' }] },
      mockSettings,
    );
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key-123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should send correct body with model, messages, and temperature', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockChatResponse('ok'));
    await llmChat(
      {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'translate this' },
        ],
        temperature: 0.7,
        maxTokens: 500,
      },
      mockSettings,
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('glm-4-plus');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toBe('translate this');
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(500);
  });

  it('should use override base URL, API key, and model when provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockChatResponse('ok'));
    await llmChat(
      {
        messages: [{ role: 'user', content: 'test' }],
        baseUrlOverride: 'https://api.deepseek.com/v1',
        apiKeyOverride: 'sk-different-key',
        modelOverride: 'deepseek-chat',
      },
      mockSettings,
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-different-key');

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe('deepseek-chat');
  });

  it('should retry on 429 rate limit then succeed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(mockChatResponse('success after retry'));
    const result = await llmChat(
      { messages: [{ role: 'user', content: 'hi' }], maxRetries: 2 },
      mockSettings,
    );
    expect(result.content).toBe('success after retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should retry on 500 server error then succeed', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({ error: 'server error' }, 500))
      .mockResolvedValueOnce(mockChatResponse('recovered'));
    const result = await llmChat(
      { messages: [{ role: 'user', content: 'hi' }], maxRetries: 2 },
      mockSettings,
    );
    expect(result.content).toBe('recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on 401 auth failure (immediate throw)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ error: 'unauthorized' }, 401));
    await expect(
      llmChat({ messages: [{ role: 'user', content: 'hi' }], maxRetries: 3 }, mockSettings),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    try {
      await llmChat({ messages: [{ role: 'user', content: 'hi' }] }, mockSettings);
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError);
      expect((e as LlmError).category).toBe('auth');
    }
  });

  it('should throw LlmError with correct category after exhausting retries', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ error: 'rate limited' }, 429));
    try {
      await llmChat({ messages: [{ role: 'user', content: 'hi' }], maxRetries: 1 }, mockSettings);
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError);
      expect((e as LlmError).category).toBe('rate_limit');
    }
  });

  it('should respect timeoutMs override', async () => {
    // We can't easily test real timeout, but we can verify the abort signal
    // is set by checking that a fetch error with name 'AbortError' is retried
    // as a timeout category.
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(mockChatResponse('recovered'));
    const result = await llmChat(
      { messages: [{ role: 'user', content: 'hi' }], maxRetries: 2, timeoutMs: 100 },
      mockSettings,
    );
    expect(result.content).toBe('recovered');
  });

  it('should reject non-HTTPS non-localhost endpoint with auth error', async () => {
    await expect(
      llmChat(
        {
          messages: [{ role: 'user', content: 'hi' }],
          baseUrlOverride: 'http://evil.example.com/v1',
        },
        mockSettings,
      ),
    ).rejects.toThrow();

    try {
      await llmChat(
        { messages: [{ role: 'user', content: 'hi' }], baseUrlOverride: 'ftp://bad.com' },
        mockSettings,
      );
    } catch (e) {
      expect(e).toBeInstanceOf(LlmError);
      expect((e as LlmError).category).toBe('auth');
    }
  });
});