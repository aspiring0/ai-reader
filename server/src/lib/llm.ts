 import { isAllowedDomain } from './http.js';
 import type { Settings } from '@shared/types';
 
 export type LlmErrorCategory = 'auth' | 'rate_limit' | 'timeout' | 'parse' | 'network' | 'unknown';
 
 export class LlmError extends Error {
   readonly category: LlmErrorCategory;
   readonly statusCode?: number;
 
   constructor(category: LlmErrorCategory, message: string, statusCode?: number) {
     super(message);
     this.name = 'LlmError';
     this.category = category;
     this.statusCode = statusCode;
   }
 }
 
 export interface InterpretResult {
   title_zh: string;
   summary: string;
 }
 
const SYSTEM_PROMPT = [
  'You are a Chinese tech editor for an AI tools radar.',
  'Given an item, produce a concise Chinese title (10-25 characters) and a',
  'detailed Chinese summary (150-350 characters).',
  'The summary should explain: (1) what the tool/skill does, (2) its main use',
  'cases or target scenarios, (3) key features or standout capabilities.',
  'Write in natural Chinese prose, not bullet points. Be specific and informative.',
  'Respond ONLY as JSON: {"title_zh": "...", "summary": "..."}',
].join(' ');
 
 const MAX_RETRIES = 2;
 const BACKOFF_BASE_MS = 1000;
 
 /** Extract JSON object from a possibly-fenced or prose-wrapped LLM response. */
 function extractJson(raw: string): { title_zh?: string; summary?: string } | null {
   // Strip markdown code fences
   let text = raw.trim();
   if (text.startsWith('```')) {
     text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
   }

   // Try direct parse
   try {
     return JSON.parse(text);
   } catch {
     // Continue to regex extraction
   }
 
   // Extract first {...} block
   const match = text.match(/\{[\s\S]*\}/);
   if (match) {
     try {
       return JSON.parse(match[0]);
     } catch {
       return null;
     }
   }
   return null;
 }
 
/** Call Zhipu GLM to interpret a single item into Chinese title + summary. */
export async function interpretItem(
 item: { title: string; summary: string | null; raw_data: string | null },
  settings: Settings,
): Promise<InterpretResult> {
  const baseUrl = settings.llm_base_url.replace(/\/$/, '');
  const endpoint = `${baseUrl}/chat/completions`;

  if (!isAllowedDomain(endpoint)) {
    throw new LlmError('auth', `LLM endpoint domain not whitelisted: ${new URL(endpoint).hostname}`);
  }

  // Extract additional context from raw_data for richer summaries
  let extraContext: Record<string, unknown> = {};
  try {
    if (item.raw_data) {
      const rd = JSON.parse(item.raw_data) as Record<string, unknown>;
      extraContext = {
        topics: rd.topics,
        homepage: rd.homepage,
        language: rd.language,
        license: typeof rd.license === 'object' && rd.license ? (rd.license as Record<string, unknown>).name : rd.license,
        stars: rd.stargazers_count,
        forks: rd.forks_count,
      };
    }
  } catch {
    // Ignore parse errors, proceed with basic context
  }

  const userContent = JSON.stringify({
    title: item.title,
   description: item.summary ?? '',
    ...extraContext,
  });
 
 const body = JSON.stringify({
     model: settings.llm_model,
     messages: [
       { role: 'system', content: SYSTEM_PROMPT },
       { role: 'user', content: userContent },
     ],
     temperature: 0.3,
   });
 
   const headers: Record<string, string> = {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${settings.llm_api_key}`,
   };
 
   let lastError: LlmError | null = null;
 
   for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), settings.llm_timeout_ms);
 
     try {
       const resp = await fetch(endpoint, {
         method: 'POST',
         headers,
         body,
         signal: controller.signal,
       });
 
       clearTimeout(timeoutId);
 
       if (resp.status === 401 || resp.status === 403) {
         throw new LlmError('auth', `LLM auth failed (${resp.status})`, resp.status);
       }
 
       if (resp.status === 429) {
         lastError = new LlmError('rate_limit', 'LLM rate limited (429)', 429);
         if (attempt < MAX_RETRIES) {
           await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
           continue;
         }
         throw lastError;
       }
 
       if (resp.status >= 500) {
         lastError = new LlmError('network', `LLM server error (${resp.status})`, resp.status);
         if (attempt < MAX_RETRIES) {
           await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * Math.pow(2, attempt)));
           continue;
         }
         throw lastError;
       }
 
       if (!resp.ok) {
         throw new LlmError('unknown', `LLM request failed (${resp.status})`, resp.status);
       }
 
       const data = await resp.json() as {
         choices?: Array<{ message?: { content?: string } }>;
       };
 
       const content = data.choices?.[0]?.message?.content ?? '';
       const parsed = extractJson(content);
 
       if (parsed && parsed.title_zh) {
         return {
           title_zh: parsed.title_zh,
           summary: parsed.summary ?? content,
         };
       }
 
       // JSON parse failed: fall back to original title, raw content as summary
       return {
         title_zh: item.title,
         summary: content,
       };
     } catch (err) {
       clearTimeout(timeoutId);
 
       if (err instanceof LlmError) {
         // Auth errors are not retryable
         if (err.category === 'auth') throw err;
         // Rate limit / server errors: retry handled above via continue
         if (err.category === 'rate_limit' || err.category === 'network') {
           if (attempt < MAX_RETRIES) continue;
           throw err;
         }
         throw err;
       }
 
       // Abort/timeout
       if (err instanceof Error && err.name === 'AbortError') {
         lastError = new LlmError('timeout', 'LLM request timed out');
         if (attempt < MAX_RETRIES) continue;
         throw lastError;
       }
 
       lastError = new LlmError('network', err instanceof Error ? err.message : String(err));
       if (attempt < MAX_RETRIES) continue;
       throw lastError;
     }
   }
 
   throw lastError ?? new LlmError('unknown', 'LLM request exhausted retries');
 }
