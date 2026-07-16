import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyCompatibility,
  type CompatibilityResult,
  type RepoFile,
  type RepoMeta,
} from '../src/install/compatibility.js';

// Helper: build a mock GitHub Contents API response for the repo root
function mockContentsResponse(files: { name: string; type: string; path: string }[]): RepoFile[] {
  return files.map(f => ({ name: f.name, type: f.type, path: f.path }));
}

// Helper: build repo metadata
function mockMeta(overrides: Partial<RepoMeta> = {}): RepoMeta {
  return {
    topics: [],
    fullName: 'test/repo',
    url: 'https://github.com/test/repo',
    description: 'A test repo',
    ...overrides,
  };
}

// Mock SKILL.md content with valid YAML frontmatter
const VALID_SKILL_MD = `---
name: my-awesome-skill
description: A skill that does awesome things for developers.
metadata:
  short-description: Does awesome things
---

# My Awesome Skill

This skill provides capabilities for...`;

// Mock SKILL.md with invalid frontmatter (missing name)
const INVALID_SKILL_MD = `---
description: Missing the name field
---

Some content`;

describe('classifyCompatibility', () => {

  it('should classify as Tier A when SKILL.md exists with valid frontmatter and codex topic', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
      { name: 'scripts', type: 'dir', path: 'scripts' },
    ]);
    const meta = mockMeta({ topics: ['codex', 'codex-skill', 'ai-agent'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(VALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('A');
    expect(result.installable).toBe(true);
    expect(result.skillName).toBe('my-awesome-skill');
    expect(result.skillDescription).toContain('awesome things');
  });

  it('should classify as Tier A when SKILL.md exists with valid frontmatter and codex-skill topic', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
    ]);
    const meta = mockMeta({ topics: ['codex-skill', 'llm'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(VALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('A');
    expect(result.installable).toBe(true);
  });

  it('should classify as Tier B when SKILL.md exists with valid frontmatter but no codex topic', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
    ]);
    const meta = mockMeta({ topics: ['claude-code', 'ai-agent'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(VALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('B');
    expect(result.installable).toBe(true);
    expect(result.skillName).toBe('my-awesome-skill');
  });

  it('should classify as Tier B when SKILL.md exists with valid frontmatter and no topics', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
    ]);
    const meta = mockMeta({ topics: [] });
    const fetchSkillMd = vi.fn().mockResolvedValue(VALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('B');
    expect(result.installable).toBe(true);
  });

  it('should classify as Tier C when SKILL.md exists but has invalid frontmatter', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
    ]);
    const meta = mockMeta({ topics: ['codex'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(INVALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('C');
    expect(result.installable).toBe(false);
  });

  it('should classify as Tier E when no SKILL.md and topics include mcp', async () => {
    const files = mockContentsResponse([
      { name: 'package.json', type: 'file', path: 'package.json' },
      { name: 'src', type: 'dir', path: 'src' },
    ]);
    const meta = mockMeta({ topics: ['mcp', 'llm'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(null);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('E');
    expect(result.installable).toBe(false);
  });

  it('should classify as Tier D when no SKILL.md and no MCP signals (has package.json)', async () => {
    const files = mockContentsResponse([
      { name: 'package.json', type: 'file', path: 'package.json' },
      { name: 'src', type: 'dir', path: 'src' },
    ]);
    const meta = mockMeta({ topics: ['ai-agent', 'cli'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(null);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('D');
    expect(result.installable).toBe(false);
  });

  it('should classify as Tier F when no SKILL.md and topics suggest cursor/prompt', async () => {
    const files = mockContentsResponse([
      { name: 'README.md', type: 'file', path: 'README.md' },
    ]);
    const meta = mockMeta({ topics: ['cursor-rules', 'prompt'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(null);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('F');
    expect(result.installable).toBe(false);
  });

  it('should default to Tier D when no signals at all', async () => {
    const files = mockContentsResponse([
      { name: 'README.md', type: 'file', path: 'README.md' },
    ]);
    const meta = mockMeta({ topics: [] });
    const fetchSkillMd = vi.fn().mockResolvedValue(null);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.tier).toBe('D');
    expect(result.installable).toBe(false);
  });

  it('should detect MCP signal from package.json even without mcp topic', async () => {
    const files = mockContentsResponse([
      { name: 'package.json', type: 'file', path: 'package.json' },
    ]);
    const meta = mockMeta({ topics: ['ai-agent'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(null);
    const fetchPackageJson = vi.fn().mockResolvedValue('{"name":"mcp-server-foo","bin":{"mcp-server":"./index.js"}}');

    const result = await classifyCompatibility(files, meta, fetchSkillMd, fetchPackageJson);

    expect(result.tier).toBe('E');
    expect(result.installable).toBe(false);
  });

  it('should provide a user-friendly label for each tier', async () => {
    const files = mockContentsResponse([
      { name: 'SKILL.md', type: 'file', path: 'SKILL.md' },
    ]);
    const meta = mockMeta({ topics: ['codex'] });
    const fetchSkillMd = vi.fn().mockResolvedValue(VALID_SKILL_MD);

    const result = await classifyCompatibility(files, meta, fetchSkillMd);

    expect(result.label).toBeDefined();
    expect(typeof result.label).toBe('string');
    expect(result.label.length).toBeGreaterThan(0);
  });
});
