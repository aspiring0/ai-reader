import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  safeResolvePath,
  isSkillFile,
  filterSkillFiles,
  installSkill,
} from '../src/install/installer.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('safeResolvePath', () => {
  const base = path.join(os.tmpdir(), 'skill-test-base');
  beforeEach(() => { fs.mkdirSync(base, { recursive: true }); });
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }); });

  it('should resolve a normal relative path', () => {
    const resolved = safeResolvePath(base, 'scripts/run.js');
    expect(resolved).toBe(path.join(base, 'scripts', 'run.js'));
  });

  it('should reject path traversal with ..', () => {
    expect(() => safeResolvePath(base, '../../../etc/passwd')).toThrow(/traversal/i);
  });

  it('should reject absolute paths outside target', () => {
    expect(() => safeResolvePath(base, '/etc/passwd')).toThrow(/traversal/i);
  });

  it('should accept a nested path inside target', () => {
    const resolved = safeResolvePath(base, 'scripts/sub/helper.js');
    expect(resolved.startsWith(base)).toBe(true);
  });
});

describe('isSkillFile', () => {
  it('should select SKILL.md', () => {
    expect(isSkillFile('SKILL.md')).toBe(true);
  });
  it('should select scripts/ files', () => {
    expect(isSkillFile('scripts/run.js')).toBe(true);
    expect(isSkillFile('scripts/sub/helper.py')).toBe(true);
  });
  it('should select references/ and assets/ files', () => {
    expect(isSkillFile('references/guide.md')).toBe(true);
    expect(isSkillFile('assets/logo.png')).toBe(true);
  });
  it('should select README.md', () => {
    expect(isSkillFile('README.md')).toBe(true);
  });
  it('should reject tests, CI, and unrelated files', () => {
    expect(isSkillFile('tests/foo.test.js')).toBe(false);
    expect(isSkillFile('.github/workflows/ci.yml')).toBe(false);
    expect(isSkillFile('package-lock.json')).toBe(false);
    expect(isSkillFile('docs/design.md')).toBe(false);
  });
});

describe('filterSkillFiles', () => {
  it('should separate selected and skipped files', () => {
    const files = [
      { path: 'SKILL.md', type: 'file' as const, download_url: 'u1', size: 100 },
      { path: 'scripts/run.js', type: 'file' as const, download_url: 'u2', size: 200 },
      { path: 'tests/foo.test.js', type: 'file' as const, download_url: 'u3', size: 50 },
      { path: '.github/ci.yml', type: 'file' as const, download_url: 'u4', size: 80 },
    ];
    const { selected, skipped } = filterSkillFiles(files);
    expect(selected).toHaveLength(2);
    expect(skipped).toBe(2);
  });
  it('should exclude directories from selected', () => {
    const files = [
      { path: 'scripts', type: 'dir' as const, download_url: null, size: 0 },
      { path: 'SKILL.md', type: 'file' as const, download_url: 'u1', size: 100 },
    ];
    const { selected } = filterSkillFiles(files);
    expect(selected).toHaveLength(1);
  });
});

describe('installSkill (API method)', () => {
  let tmpHome: string;
  beforeEach(() => { tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-')); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmpHome, { recursive: true, force: true }); });

  it('should selectively download skill files to skills dir', async () => {
    const apiResponse = [
      { path: 'SKILL.md', type: 'file', download_url: 'https://api.github.com/repos/o/r/contents/SKILL.md', size: 50 },
      { path: 'scripts/run.js', type: 'file', download_url: 'https://api.github.com/repos/o/r/contents/scripts/run.js', size: 30 },
      { path: 'tests/x.test.js', type: 'file', download_url: 'https://api.github.com/repos/o/r/contents/tests/x.test.js', size: 20 },
    ];
    const fileContents: Record<string, string> = {
      'SKILL.md': '---\nname: test\n---\nbody',
      'run.js': 'console.log(1)',
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/contents?')) {
        return { ok: true, status: 200, json: async () => apiResponse } as Response;
      }
      const fname = url.split('/').pop() ?? '';
      return { ok: true, status: 200, text: async () => fileContents[fname] ?? '' } as Response;
    });
    const result = await installSkill({ repoFullName: 'o/r', skillName: 'test-skill', codexHome: tmpHome, method: 'api' });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('api');
    expect(result.filesWritten).toBe(2);
    expect(fs.existsSync(path.join(tmpHome, 'skills', 'test-skill', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, 'skills', 'test-skill', 'scripts', 'run.js'))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, 'skills', 'test-skill', 'tests', 'x.test.js'))).toBe(false);
  });

  it('should reject path traversal in downloaded file paths', async () => {
    const apiResponse = [
      { path: 'scripts/../../../evil.js', type: 'file', download_url: 'https://api.github.com/contents/evil', size: 10 },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => apiResponse,
    } as Response);
    await expect(installSkill({ repoFullName: 'o/r', skillName: 'evil', codexHome: tmpHome, method: 'api' })).rejects.toThrow(/traversal/i);
  });
});

describe('installSkill (clone fallback)', () => {
  let tmpHome: string;
  beforeEach(() => { tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-')); });
  afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmpHome, { recursive: true, force: true }); });

  it('should fall back to clone when method is clone', async () => {
    const fakeClone = async (_repoUrl: string, targetDir: string) => {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), '---\nname: cloned\n---\nbody');
    };
    const result = await installSkill({ repoFullName: 'o/r', skillName: 'cloned-skill', codexHome: tmpHome, method: 'clone', gitClone: fakeClone });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('clone');
    expect(fs.existsSync(path.join(tmpHome, 'skills', 'cloned-skill', 'SKILL.md'))).toBe(true);
  });

  it('should fall back to clone when repo has too many files', async () => {
    const manyFiles = Array.from({ length: 300 }, (_, i) => ({
      path: 'scripts/f' + i + '.js', type: 'file', download_url: 'u' + i, size: 1,
    }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => manyFiles,
    } as Response);
    const fakeClone = async (_repoUrl: string, targetDir: string) => {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'SKILL.md'), 'cloned');
    };
    const result = await installSkill({ repoFullName: 'o/r', skillName: 'big-skill', codexHome: tmpHome, method: 'auto', gitClone: fakeClone });
    expect(result.method).toBe('clone');
    expect(result.ok).toBe(true);
  });
});
