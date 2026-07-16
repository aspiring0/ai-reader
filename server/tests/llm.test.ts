 import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
 import { interpretItem, LlmError } from '../src/lib/llm.js';
 import { DEFAULT_SETTINGS } from '@shared/types';
 import type { Settings } from '@shared/types';
 
 const mockSettings: Settings = {
   ...DEFAULT_SETTINGS,
   llm_api_key: 'test-key-123',
 };
 
 function mockFetchResponse(body: unknown, status = 200): Response {
   return {
     ok: status >= 200 && status < 300,
     status,
     json: async () => body,
     text: async () => JSON.stringify(body),
   } as Response;
 }
 
 describe('LLM Client', () => {
   afterEach(() => {
     vi.restoreAllMocks();
   });
 
   it('should parse a valid JSON response from GLM', async () => {
     const glmResponse = {
       choices: [{
         message: {
           content: '{"title_zh": "\u6df1\u5ea6\u5b66\u4e60\u5de5\u5177", "summary": "\u4e00\u4e2a\u5f3a\u5927\u7684AI\u5de5\u5177"}',
         },
       }],
     };
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(glmResponse));
 
     const result = await interpretItem({
       title: 'DeepSeek-Reasonix',
       summary: 'A powerful AI reasoning engine',
       raw_data: null,
     }, mockSettings);
 
     expect(result.title_zh).toBe('\u6df1\u5ea6\u5b66\u4e60\u5de5\u5177');
     expect(result.summary).toBe('\u4e00\u4e2a\u5f3a\u5927\u7684AI\u5de5\u5177');
   });
 
   it('should strip markdown fences from JSON response', async () => {
     const glmResponse = {
       choices: [{
         message: {
           content: '```json\n{"title_zh": "\u6d4b\u8bd5", "summary": "\u6d4b\u8bd5\u6458\u8981"}\n```',
         },
       }],
     };
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(glmResponse));
 
     const result = await interpretItem({
       title: 'Test Project',
       summary: null,
       raw_data: null,
     }, mockSettings);
 
     expect(result.title_zh).toBe('\u6d4b\u8bd5');
   });
 
   it('should fall back to original title when JSON parse fails', async () => {
     const glmResponse = {
       choices: [{
         message: {
           content: 'This is not JSON at all, just some prose.',
         },
       }],
     };
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(glmResponse));
 
     const result = await interpretItem({
       title: 'OriginalTitle',
       summary: null,
       raw_data: null,
     }, mockSettings);
 
     expect(result.title_zh).toBe('OriginalTitle');
     expect(result.summary).toContain('This is not JSON');
   });
 
   it('should throw LlmError on 401 auth failure', async () => {
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse({ error: 'unauthorized' }, 401));
 
     await expect(interpretItem({
       title: 'Test',
       summary: null,
       raw_data: null,
     }, mockSettings)).rejects.toThrow();
 
     try {
       await interpretItem({ title: 'T', summary: null, raw_data: null }, mockSettings);
     } catch (e) {
       expect(e).toBeInstanceOf(LlmError);
       expect((e as LlmError).category).toBe('auth');
     }
   });
 
   it('should retry on 429 rate limit then succeed', async () => {
     const successResponse = {
       choices: [{
         message: {
           content: '{"title_zh": "\u91cd\u8bd5\u6210\u529f", "summary": "\u6210\u529f"}',
         },
       }],
     };
     const fetchMock = vi.spyOn(globalThis, 'fetch')
       .mockResolvedValueOnce(mockFetchResponse({ error: 'rate limited' }, 429))
       .mockResolvedValueOnce(mockFetchResponse(successResponse));
 
     const result = await interpretItem({
       title: 'RetryTest',
       summary: null,
       raw_data: null,
     }, mockSettings);
 
     expect(result.title_zh).toBe('\u91cd\u8bd5\u6210\u529f');
     expect(fetchMock).toHaveBeenCalledTimes(2);
   });
 
   it('should send correct request body with model and messages', async () => {
     const glmResponse = {
       choices: [{ message: { content: '{"title_zh": "T", "summary": "S"}' } }],
     };
     const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(glmResponse));
 
     await interpretItem({
       title: 'SomeRepo/project',
       summary: 'A project description',
       raw_data: null,
     }, mockSettings);
 
     expect(fetchMock).toHaveBeenCalledTimes(1);
     const callArgs = fetchMock.mock.calls[0];
     const url = callArgs[0] as string;
     const options = callArgs[1] as RequestInit;
 
     expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
     expect(options.method).toBe('POST');
 
     const body = JSON.parse(options.body as string);
     expect(body.model).toBe('glm-4-plus');
     expect(body.messages).toHaveLength(2);
     expect(body.messages[0].role).toBe('system');
     expect(body.messages[1].role).toBe('user');
 
     const headers = options.headers as Record<string, string>;
     expect(headers['Authorization']).toBe('Bearer test-key-123');
   });
 
   it('should never log the API key', async () => {
     const consoleSpy = vi.spyOn(console, 'log');
     const glmResponse = {
       choices: [{ message: { content: '{"title_zh": "T", "summary": "S"}' } }],
     };
     vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse(glmResponse));
 
     await interpretItem({
       title: 'Test',
       summary: null,
       raw_data: null,
     }, mockSettings);
 
     for (const call of consoleSpy.mock.calls) {
       const str = JSON.stringify(call);
       expect(str).not.toContain('test-key-123');
     }
   });
 });
