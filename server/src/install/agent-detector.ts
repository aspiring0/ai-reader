export type AgentType = 'docker' | 'go' | 'npm' | 'pip' | 'skill' | 'manual';

export interface DetectionResult {
  type: AgentType;
  confidence: number;       // 0-1
  reason: string;           // why this type was chosen
  buildCommand?: string;    // suggested build command
  runCommand?: string;      // suggested run command after install
}

/**
 * Detect project type from a list of file paths in the repo.
 * Priority: docker > go > npm > pip > skill > manual
 */
export function detectAgentType(files: string[], repoName: string): DetectionResult {
  const lower = files.map(f => f.toLowerCase());

  // Docker: Dockerfile or docker-compose.yml in root
  if (lower.includes('dockerfile') || lower.includes('docker-compose.yml') || lower.includes('docker-compose.yaml')) {
    return {
      type: 'docker',
      confidence: 0.9,
      reason: 'Dockerfile detected',
      buildCommand: 'docker build -t ' + repoName + ' .',
      runCommand: 'docker run -it ' + repoName,
    };
  }

  // Go: go.mod + cmd/ directory or main.go
  if (lower.includes('go.mod')) {
    const hasCmdDir = files.some(f => f.startsWith('cmd/'));
    const hasMain = lower.includes('main.go');
    if (hasCmdDir) {
      const cmdDir = files.find(f => f.startsWith('cmd/') && f.endsWith('/main.go'));
      const cmdName = cmdDir ? cmdDir.split('/')[1] : repoName;
      return {
        type: 'go',
        confidence: 0.95,
        reason: 'go.mod + cmd/ directory detected',
        buildCommand: 'go build -o ' + cmdName + ' ./cmd/' + cmdName,
        runCommand: './' + cmdName,
      };
    }
    if (hasMain) {
      return {
        type: 'go',
        confidence: 0.85,
        reason: 'go.mod + main.go detected',
        buildCommand: 'go build -o ' + repoName + ' .',
        runCommand: './' + repoName,
      };
    }
  }

  // npm: package.json with bin field
  if (lower.includes('package.json')) {
    return {
      type: 'npm',
      confidence: 0.8,
      reason: 'package.json detected',
      buildCommand: 'npm install && npm run build',
      runCommand: 'npm start',
    };
  }

  // pip: setup.py or pyproject.toml
  if (lower.includes('setup.py') || lower.includes('pyproject.toml')) {
    return {
      type: 'pip',
      confidence: 0.75,
      reason: 'Python package config detected',
      buildCommand: 'pip install -e .',
      runCommand: 'python -m ' + repoName,
    };
  }

  // Codex skill
  if (lower.includes('skill.md')) {
    return {
      type: 'skill',
      confidence: 0.9,
      reason: 'SKILL.md detected',
    };
  }

  // Manual fallback
  return {
    type: 'manual',
    confidence: 0.3,
    reason: 'No recognized build system detected',
  };
}
