import { describe, it, expect, afterEach, vi } from 'vitest';
import { analyzeInstallPlan } from '../src/install/install-analyzer.js';
import { DEFAULT_SETTINGS } from '@shared/types';
import type { Settings } from '@shared/types';
import * as config from '../src/lib/config.js';

const noKeySettings: Settings = { ...DEFAULT_SETTINGS, llm_api_key: '' };
const withKeySettings: Settings = { ...DEFAULT_SETTINGS, llm_api_key: 'test-key' };

function mockFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

// Mock a valid LLM chat response containing a structured install plan
function mockPlanResponse(): Response {
  const plan = {
    project_type: 'go',
    summary: 'A distributed task queue written in Go',
    prerequisites: ['Go 1.21+', 'Redis 6+'],
    steps: [
      { command: 'go build -o asynq ./cmd/asynq', description: 'Build the binary' },
      { command: 'go build -o asynq-server ./cmd/server', description: 'Build the server' },
    ],
    run_command: './asynq',
    notes: ['Requires Redis running on localhost:6379'],
    confidence: 0.85,
  };
  return mockFetchResponse({
    choices: [{ message: { content: JSON.stringify(plan) } }],
  });
}

describe('Install Plan Analyzer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return structured plan from valid LLM JSON response', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    vi.spyOn(globalThis, 'fetch')
      // First call: README fetch
      .mockResolvedValueOnce(mockFetchResponse('# Asynq\n\nA task queue for Go.'))
      // Second call: llmChat
      .mockResolvedValueOnce(mockPlanResponse());

    const plan = await analyzeInstallPlan('hibiken/asynq', ['go.mod', 'cmd/asynq/main.go', 'README.md']);

    expect(plan.project_type).toBe('go');
    expect(plan.summary).toBe('A distributed task queue written in Go');
    expect(plan.prerequisites).toContain('Go 1.21+');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].command).toBe('go build -o asynq ./cmd/asynq');
    expect(plan.run_command).toBe('./asynq');
    expect(plan.confidence).toBe(0.85);
  });

  it('should parse steps, prerequisites, and notes from LLM output', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse('Some README'))
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: JSON.stringify({
          project_type: 'docker',
          summary: 'Self-hosted API gateway',
          prerequisites: ['Docker 20+', 'Docker Compose'],
          steps: [
            { command: 'docker-compose up -d', description: 'Start all services' },
          ],
          run_command: 'curl http://localhost:8080',
          notes: ['Port 8080 must be free', 'First run downloads ~500MB images'],
          confidence: 0.9,
        }) } }],
      }));

    const plan = await analyzeInstallPlan('example/gateway', ['docker-compose.yml', 'Dockerfile', 'README.md']);

    expect(plan.prerequisites).toHaveLength(2);
    expect(plan.notes).toHaveLength(2);
    expect(plan.notes[1]).toContain('500MB');
  });

  it('should fallback to detectAgentType when LLM key not configured', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(noKeySettings);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse('ok'));

    const plan = await analyzeInstallPlan('some/go-project', ['go.mod', 'main.go']);

    // Should still return a plan (from file detection), just without LLM enrichment
    expect(plan.project_type).toBe('go');
    expect(plan.confidence).toBeLessThan(0.5); // Low confidence fallback
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('should fallback when llmChat throws', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    vi.spyOn(globalThis, 'fetch')
      // README fetch succeeds
      .mockResolvedValueOnce(mockFetchResponse('readme'))
      // llmChat fetch fails with 500
      .mockResolvedValueOnce(mockFetchResponse({ error: 'server error' }, 500))
      // retry also fails
      .mockResolvedValue(mockFetchResponse({ error: 'server error' }, 500));

    const plan = await analyzeInstallPlan('some/go-project', ['go.mod', 'cmd/app/main.go']);

    expect(plan.project_type).toBe('go');
    expect(plan.confidence).toBeLessThan(0.5);
  });

  it('should cap README at 4000 chars before sending to LLM', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    const longReadme = 'A'.repeat(10000);
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse(longReadme))
      .mockResolvedValueOnce(mockPlanResponse());

    await analyzeInstallPlan('some/repo', ['go.mod', 'README.md']);

    // Check the llmChat call body (second fetch call)
    const chatCall = fetchMock.mock.calls[1];
    const body = JSON.parse((chatCall[1] as RequestInit).body as string);
    const userContent = body.messages[body.messages.length - 1].content;
    // README should be truncated — less than 10000 'A's present
    const aCount = (userContent.match(/A/g) || []).length;
    expect(aCount).toBeLessThan(10000);
  });

  it('should handle missing README gracefully (fetch 404)', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    vi.spyOn(globalThis, 'fetch')
      // README fetch fails (404)
      .mockResolvedValueOnce(mockFetchResponse('Not Found', 404))
      // llmChat still works with just file list
      .mockResolvedValueOnce(mockPlanResponse());

    const plan = await analyzeInstallPlan('some/repo', ['go.mod', 'main.go']);

    expect(plan.project_type).toBe('go');
    expect(plan.summary).toBeTruthy();
  });

  it('should strip markdown fences from LLM JSON response', async () => {
    vi.spyOn(config, 'getSettings').mockReturnValue(withKeySettings);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse('readme'))
      .mockResolvedValueOnce(mockFetchResponse({
        choices: [{ message: { content: '```json\n' + JSON.stringify({
          project_type: 'npm',
          summary: 'A React component library',
          prerequisites: ['Node 18+'],
          steps: [{ command: 'npm install', description: 'Install deps' }],
          run_command: 'npm run dev',
          notes: [],
          confidence: 0.8,
        }) + '\n```' } }],
      }));

    const plan = await analyzeInstallPlan('some/repo', ['package.json', 'README.md']);

    expect(plan.project_type).toBe('npm');
    expect(plan.steps[0].command).toBe('npm install');
  });
});