/**
 * V2.5.1 Install Plan Analyzer
 *
 * Uses LLM to analyze a repo's README + file listing and produce a
 * structured install plan with real commands. Falls back to file-based
 * detection when LLM is not configured or fails.
 */

import { llmChat } from '../lib/llm-client.js';
import { getSettings } from '../lib/config.js';
import { detectAgentType } from './agent-detector.js';
import { logger } from '../lib/logger.js';

// ---- Types ----

export interface InstallStep {
  command: string;
  description: string;
}

export interface InstallPlan {
  project_type: string;
  summary: string;
  prerequisites: string[];
  steps: InstallStep[];
  run_command: string;
  notes: string[];
  confidence: number;
}

// ---- Constants ----

const MAX_README_LENGTH = 4000;
const README_CANDIDATES = ['README.md', 'readme.md', 'README.MD', 'README.rst', 'README.txt', 'README'];

// ---- Prompt ----

const SYSTEM_PROMPT = [
  'You are a DevOps engineer. Analyze a GitHub repository and produce a',
  'structured installation plan. Based on the README and file listing,',
  'determine the correct build commands, prerequisites, and any gotchas.',
  '',
  'Respond ONLY as JSON with this exact shape:',
  '{"project_type": "docker|go|npm|pip|manual", "summary": "1-2 sentence description",',
  '"prerequisites": ["tool version requirements"], "steps": [{"command": "exact shell command", "description": "what it does"}],',
  '"run_command": "how to run after install", "notes": ["warnings, config tips"], "confidence": 0.0-1.0}',
  '',
  'Rules:',
  '- steps should NOT include git clone (that is handled separately)',
  '- Focus on build/compile/install commands',
  '- Include environment variables or flags if needed',
  '- If unsure about a step, put it in notes instead',
  '- confidence: how certain you are the plan is correct (0.0-1.0)',
].join('\n');

// ---- README fetching ----

function githubHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-radar',
  };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

/**
 * Fetch README content from a repo. Tries multiple filename variants.
 * Returns null if no README is found.
 */
export async function fetchReadme(repoFullName: string, token?: string): Promise<string | null> {
  for (const name of README_CANDIDATES) {
    const url = 'https://raw.githubusercontent.com/' + repoFullName + '/HEAD/' + name;
    try {
      const resp = await fetch(url, { headers: githubHeaders(token) });
      if (resp.ok) {
        return await resp.text();
      }
    } catch {
      // try next variant
    }
  }
  return null;
}

// ---- JSON extraction ----

/**
 * Extract JSON object from a possibly-fenced LLM response.
 * Strips markdown code fences and handles common formatting issues.
 */
function extractJson(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  text = text.replace(/```(?:json)?\s*/gi, '');

  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch { /* try fix */ }

  // Fix trailing commas
  const fixed = match[0].replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

// ---- Fallback plan (no LLM) ----

/**
 * Build a basic plan from file-based detection (current behavior).
 */
function fallbackPlan(repoFullName: string, fileNames: string[]): InstallPlan {
  const repoName = repoFullName.split('/').pop() ?? repoFullName;
  const detection = detectAgentType(fileNames, repoName);

  const steps: InstallStep[] = [];
  if (detection.buildCommand) {
    steps.push({ command: detection.buildCommand, description: 'Build the project' });
  }

  return {
    project_type: detection.type,
    summary: detection.reason,
    prerequisites: [],
    steps,
    run_command: detection.runCommand ?? './' + repoName,
    notes: [],
    confidence: detection.confidence * 0.5, // Lower confidence for fallback
  };
}

// ---- Main function ----

/**
 * Analyze a GitHub repo's README + file list with LLM to produce
 * a structured install plan. Falls back to detectAgentType() if LLM
 * is not configured or the request fails.
 */
export async function analyzeInstallPlan(
  repoFullName: string,
  fileNames: string[],
  token?: string,
): Promise<InstallPlan> {
  const settings = getSettings();

  // No LLM configured -> immediate fallback
  if (!settings.llm_api_key?.trim()) {
    logger.info('install', 'analyze', 'No LLM key, using fallback detection for ' + repoFullName);
    return fallbackPlan(repoFullName, fileNames);
  }

  // Fetch README (best-effort)
  let readme: string | null = null;
  try {
    readme = await fetchReadme(repoFullName, token);
  } catch {
    // Continue without README
  }

  // Cap README length to stay within token budget
  const readmeCapped = readme ? readme.slice(0, MAX_README_LENGTH) : '(no README found)';

  // Build user message
  const userContent = JSON.stringify({
    repo: repoFullName,
    files: fileNames.slice(0, 100), // Cap file list
    readme: readmeCapped,
  });

  try {
    const result = await llmChat(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        maxTokens: 800,
      },
      settings,
    );

    const parsed = extractJson(result.content);
    if (!parsed) {
      logger.warn('install', 'analyze', 'LLM returned unparseable JSON for ' + repoFullName);
      return fallbackPlan(repoFullName, fileNames);
    }

    // Validate and normalize the plan
    const plan: InstallPlan = {
      project_type: String(parsed.project_type ?? 'manual'),
      summary: String(parsed.summary ?? ''),
      prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites.map(String) : [],
      steps: Array.isArray(parsed.steps)
        ? parsed.steps
            .filter((s) => s && typeof s === 'object')
            .map((s) => ({
              command: String((s as Record<string, unknown>).command ?? ''),
              description: String((s as Record<string, unknown>).description ?? ''),
            }))
            .filter((s) => s.command.length > 0)
        : [],
      run_command: String(parsed.run_command ?? ''),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map(String) : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };

    logger.info('install', 'analyze', 'LLM plan generated for ' + repoFullName + ' (confidence: ' + plan.confidence + ')');
    return plan;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('install', 'analyze', 'LLM plan failed for ' + repoFullName + ': ' + msg + ', using fallback');
    return fallbackPlan(repoFullName, fileNames);
  }
}