import { llmChat } from './llm-client.js';
import type { Settings } from '@shared/types';

// Re-export LlmError for backward compatibility (callers import from llm.ts)
export { LlmError, type LlmErrorCategory } from './llm-client.js';

export interface InterpretResult {
  title_zh: string;
  summary: string;
}

const SYSTEM_PROMPT = [
  'You are a senior Chinese tech editor for an AI tools radar.',
  'Given an item, produce a concise Chinese title (10-25 characters) and a',
  'DETAILED Chinese summary.',
  '',
  'The summary MUST follow this EXACT structure with numbered sections:',
  '',
  'First, write 1-2 sentences describing what the tool is.',
  '1. \u6838\u5fc3\u529f\u80fd\uff1a<what it does, problem solved, how it works technically>',
  '2. \u4f7f\u7528\u573a\u666f\uff1a<specific user roles (e.g. \u540e\u7aef\u5de5\u7a0b\u5e08, \u6570\u636e\u79d1\u5b66\u5bb6) and concrete situations>',
  '3. \u5165\u95e8\u6307\u5357\uff1a<installation commands, key configs, first-run steps>',
  '4. \u4eae\u70b9\uff1a<what makes it different, community metrics, standout features>',
  '',
  'RULES:',
  '- Use EXACTLY these 4 section labels with numbers as shown above',
  '- Each section must be 2-4 sentences of specific, concrete content',
  '- Use real numbers, command examples, and technical details when available',
  '- For section 3, include actual install/usage commands in backticks',
  '- Total summary length: 400-700 Chinese characters',
  '- Write in natural Chinese prose within each section',
  '',
  'Respond ONLY as JSON: {"title_zh": "...", "summary": "..."}',
].join('\n');

/** Extract JSON object from a possibly-fenced or prose-wrapped LLM response. */
function extractJson(raw: string): { title_zh?: string; summary?: string; description?: string } | null {
  let text = raw.trim();
  text = text.replace(/```(?:json)?\s*/gi, '');

  try {
    return JSON.parse(text);
  } catch { /* continue to regex */ }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch { /* try fixes below */ }

  let fixed = match[0].replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(fixed);
  } catch { /* last resort below */ }

  const titleMatch = match[0].match(/"title_zh"\s*:\s*"([^"]*)"/);
  const summaryMatch = match[0].match(/"summary"\s*:\s*"([\s\S]*?)"\s*\}/);
  if (titleMatch || summaryMatch) {
    return {
      title_zh: titleMatch ? titleMatch[1] : undefined,
      summary: summaryMatch ? summaryMatch[1] : undefined,
    };
  }
  return null;
}

/**
 * Interpret an item: produce a Chinese title + detailed summary.
 * Delegates the HTTP/retry/error logic to llmChat().
 */
export async function interpretItem(
  item: { title: string; summary: string | null; raw_data: string | null },
  settings: Settings,
): Promise<InterpretResult> {
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

  const result = await llmChat(
    {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
    },
    settings,
  );

  const content = result.content;
  const parsed = extractJson(content);

  if (parsed && parsed.title_zh) {
    return {
      title_zh: parsed.title_zh,
      summary: parsed.summary ?? parsed.description ?? content.replace(/```/g, '').trim(),
    };
  }

  // JSON parse failed: fall back to original title, raw content as summary
  return {
    title_zh: item.title,
    summary: content,
  };
}