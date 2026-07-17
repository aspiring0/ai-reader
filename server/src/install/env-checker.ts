import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Prerequisite {
  name: string;          // 'docker', 'go', 'node', 'python'
  installed: boolean;
  version: string | null;
  path: string | null;
  installUrl: string | null;  // download link if not installed
  installHint: string | null; // short text like "Install Go 1.21+"
}

export interface EnvCheckResult {
  prerequisites: Prerequisite[];
  allMet: boolean;
  blockedBy: string[];   // names of missing prerequisites
}

/** Check if a command exists and get its version. */
function checkCommand(name: string, versionFlag: string): { installed: boolean; version: string | null; path: string | null } {
  try {
    const output = execSync(name + ' ' + versionFlag, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Extract version number from output (first line, strip non-version chars)
    const version = output.trim().split('\n')[0].replace(/[^\d.]/g, '').slice(0, 20) || output.trim().split('\n')[0].slice(0, 50);
    return { installed: true, version, path: null };
  } catch {
    return { installed: false, version: null, path: null };
  }
}

/** Get download URL for a tool based on current OS. */
function getInstallUrl(name: string): { url: string; hint: string } {
  const platform = process.platform;
  const urls: Record<string, { url: string; hint: string }> = {
    docker: {
      url: platform === 'win32' ? 'https://docs.docker.com/desktop/install/windows-install/' : 'https://docs.docker.com/engine/install/',
      hint: 'Install Docker Desktop',
    },
    go: {
      url: 'https://go.dev/dl/',
      hint: 'Install Go 1.21+ from go.dev',
    },
    node: {
      url: 'https://nodejs.org/',
      hint: 'Install Node.js 18+ from nodejs.org',
    },
    npm: {
      url: 'https://nodejs.org/',
      hint: 'npm comes with Node.js',
    },
    python: {
      url: platform === 'win32' ? 'https://www.python.org/downloads/windows/' : 'https://www.python.org/downloads/',
      hint: 'Install Python 3.10+',
    },
    pip: {
      url: 'https://pip.pypa.io/en/stable/installation/',
      hint: 'pip usually comes with Python',
    },
    git: {
      url: 'https://git-scm.com/downloads',
      hint: 'Install Git',
    },
  };
  return urls[name] ?? { url: '', hint: 'Install ' + name };
}

/** Check prerequisites for a given agent type. */
export function checkPrerequisites(agentType: string): EnvCheckResult {
  const checks: Record<string, Array<{ cmd: string; versionFlag: string; name: string }>> = {
    docker: [
      { cmd: 'docker', versionFlag: '--version', name: 'docker' },
      { cmd: 'git', versionFlag: '--version', name: 'git' },
    ],
    go: [
      { cmd: 'go', versionFlag: 'version', name: 'go' },
      { cmd: 'git', versionFlag: '--version', name: 'git' },
    ],
    npm: [
      { cmd: 'node', versionFlag: '--version', name: 'node' },
      { cmd: 'npm', versionFlag: '--version', name: 'npm' },
    ],
    pip: [
      { cmd: 'python', versionFlag: '--version', name: 'python' },
      { cmd: 'pip', versionFlag: '--version', name: 'pip' },
      { cmd: 'git', versionFlag: '--version', name: 'git' },
    ],
    skill: [],
    manual: [
      { cmd: 'git', versionFlag: '--version', name: 'git' },
    ],
  };

  const requiredChecks = checks[agentType] ?? checks['manual'];
  const prerequisites: Prerequisite[] = [];

  for (const check of requiredChecks) {
    const result = checkCommand(check.cmd, check.versionFlag);
    if (!result.installed) {
      const installInfo = getInstallUrl(check.name);
      prerequisites.push({
        name: check.name,
        installed: false,
        version: null,
        path: null,
        installUrl: installInfo.url,
        installHint: installInfo.hint,
      });
    } else {
      prerequisites.push({
        name: check.name,
        installed: true,
        version: result.version,
        path: result.path,
        installUrl: null,
        installHint: null,
      });
    }
  }

  const blockedBy = prerequisites.filter(p => !p.installed).map(p => p.name);

  return {
    prerequisites,
    allMet: blockedBy.length === 0,
    blockedBy,
  };
}

/** Detect available drives on Windows (for path selection). */
export function getAvailableDrives(): string[] {
  if (process.platform !== 'win32') {
    return ['/'];
  }
  const drives: string[] = [];
  for (const letter of 'CDEFGH') {
    const drivePath = letter + ':\\';
    try {
      fs.accessSync(drivePath);
      drives.push(letter + ':');
    } catch {
      // drive doesn't exist, skip
    }
  }
  return drives;
}

/** Get the default agents base path. Prefers D: if available. */
export function getDefaultAgentsPath(): string {
  const drives = getAvailableDrives();
  // On Windows, prefer D: if available, else LOCALAPPDATA
  if (process.platform === 'win32') {
    if (drives.includes('D:')) {
      return 'D:\\ai-radar\\agents';
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:\\', 'AppData', 'Local');
    return path.join(localAppData, 'ai-radar', 'agents');
  }
  // macOS/Linux
  const home = process.env.HOME || '/tmp';
  return path.join(home, '.local', 'share', 'ai-radar', 'agents');
}
