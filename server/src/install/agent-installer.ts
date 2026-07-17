/**
 * V2.4 Agent Installer - Core Engine
 *
 * Detects project type from a GitHub repo, clones it, runs type-specific
 * build steps, streams progress as events, and records the result.
 *
 * On failure, an AI-assisted diagnosis step sends the captured stderr to the
 * configured LLM and returns a fix suggestion.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getItemById, insertInstalledAgent } from '../db/repository.js';
import { listRepoFiles } from './installer.js';
import { detectAgentType, type DetectionResult } from './agent-detector.js';
import { checkPrerequisites, getAvailableDrives, getDefaultAgentsPath } from './env-checker.js';
import type { Prerequisite } from './env-checker.js';
import { getSettings } from '../lib/config.js';
import { llmChat } from '../lib/llm-client.js';
import { logger } from '../lib/logger.js';

// ---- Event types ----

export type InstallPhase = 'detect' | 'clone' | 'build' | 'diagnose' | 'done' | 'error';

export interface InstallEvent {
  phase: InstallPhase;
  message: string;
}

export type EmitFn = (event: InstallEvent) => void;

// ---- Public response shapes (match the frontend contract) ----

export interface EnvCheckResponse {
  detected_type: string;
  prerequisites: Prerequisite[];
  all_met: boolean;
  blocked_by: string[];
  detection: DetectionResult;
  is_skill: boolean;
}

// ---- Env / path helpers ----

/** Detect project type + check prerequisites for an item. */
export async function checkItemEnv(itemId: string): Promise<EnvCheckResponse> {
  const item = getItemById(itemId);
  if (!item) throw new Error('Item not found: ' + itemId);

  const repoFullName = item.source_id;
  const settings = getSettings();
  const token = settings.github_token || undefined;

  const files = await listRepoFiles(repoFullName, token);
  const repoName = repoFullName.split('/').pop() ?? repoFullName;
  const detection = detectAgentType(files.map((f) => f.path), repoName);

  const env = checkPrerequisites(detection.type);
  const is_skill = files.some((f) => f.path.toLowerCase().endsWith('skill.md'));

  return {
    detected_type: detection.type,
    prerequisites: env.prerequisites,
    all_met: env.allMet,
    blocked_by: env.blockedBy,
    detection,
    is_skill,
  };
}

/** Return the default agents path + available drives for the wizard. */
export function getDefaultPath(): { path: string; drives: string[] } {
  return {
    path: getDefaultAgentsPath(),
    drives: getAvailableDrives(),
  };
}

// ---- Command runner ----

/**
 * Spawn a shell command, streaming stdout/stderr lines as events.
 * On non-zero exit, triggers AI diagnosis. Rejects on failure.
 */
function runCommand(
  fullCommand: string,
  cwd: string,
  emit: EmitFn,
  phase: InstallPhase,
): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.info('install', 'run', 'Executing: ' + fullCommand + ' (cwd: ' + cwd + ')');
    const child = spawn(fullCommand, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuf = '';

    const splitLines = (chunk: Buffer | string): string[] =>
      chunk.toString().split(/\r?\n/).filter((l) => l.trim().length > 0);

    child.stdout?.on('data', (data: Buffer) => {
      for (const line of splitLines(data)) {
        emit({ phase, message: line });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuf += text;
      for (const line of splitLines(text)) {
        emit({ phase, message: line });
      }
    });

    child.on('close', async (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      emit({ phase: 'error', message: 'Command failed (exit ' + code + '): ' + fullCommand });
      const suggestion = await diagnoseError(fullCommand, stderrBuf);
      if (suggestion) {
        emit({ phase: 'diagnose', message: suggestion });
      }
      reject(new Error('Command exited ' + code + ': ' + fullCommand));
    });

    child.on('error', (err) => {
      emit({ phase: 'error', message: 'Failed to spawn: ' + err.message });
      reject(err);
    });
  });
}

// ---- AI diagnosis ----

/**
 * Send the failed command + stderr to the configured LLM for a fix suggestion.
 * Returns null if LLM is not configured or the request fails.
 */
async function diagnoseError(command: string, stderr: string): Promise<string | null> {
  const settings = getSettings();
  if (!settings.llm_api_key?.trim()) return null;

  const prompt = [
    'You are a DevOps assistant. An installation command failed during local setup.',
    'Analyze the error and suggest a concrete fix.',
    '',
    'Command: ' + command,
    '',
    'Error output:',
    stderr.slice(0, 2000),
    '',
    'Respond in 2-3 sentences with the likely cause and the specific fix.',
  ].join('\n');

  try {
    const result = await llmChat(
      {
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        timeoutMs: 15000,
        maxRetries: 1,
      },
      settings,
    );
    return result.content;
  } catch {
    return null;
  }
}

// ---- Main install orchestrator ----

export interface InstallOptions {
  itemId: string;
  installPath: string;
  emit: EmitFn;
}
export interface InstallOptions {
  itemId: string;
  installPath: string;
  emit: EmitFn;
}


/**
 * Full guided install flow:
 *   detect -> mkdir -> clone -> build (type-specific) -> record -> done
 *
 * Emits progress events throughout. Throws on failure (after diagnosis).
 */
export async function runAgentInstall(opts: InstallOptions): Promise<void> {
  const { itemId, installPath, emit } = opts;

  const item = getItemById(itemId);
  if (!item) throw new Error('Item not found: ' + itemId);

  const repoFullName = item.source_id;
  const repoUrl = 'https://github.com/' + repoFullName + '.git';
  const repoName = repoFullName.split('/').pop() ?? repoFullName;
  const agentName = repoName.replace(/[^\w.-]/g, '-').replace(/^\.+/, '');
  const targetDir = path.join(installPath, agentName);

  const settings = getSettings();
  const token = settings.github_token || undefined;

  // 1. Detect project type
  emit({ phase: 'detect', message: 'Analyzing ' + repoFullName + '...' });
  const files = await listRepoFiles(repoFullName, token);
  const detection = detectAgentType(files.map((f) => f.path), repoName);
  emit({ phase: 'detect', message: 'Detected: ' + detection.type + ' (' + detection.reason + ')' });

  // 2. Prepare directory + clone
  fs.mkdirSync(installPath, { recursive: true });

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  emit({ phase: 'clone', message: 'Cloning ' + repoFullName + ' to ' + targetDir });
  await runCommand('git clone --depth 1 ' + JSON.stringify(repoUrl) + ' ' + JSON.stringify(targetDir), installPath, emit, 'clone');
  emit({ phase: 'clone', message: 'Repository cloned' });

  // 3. Build (type-specific)
  let runCmd = detection.runCommand ?? './' + agentName;
  let binaryPath: string | null = null;
  let dockerImage: string | null = null;

  switch (detection.type) {
    case 'docker': {
      emit({ phase: 'build', message: 'Building Docker image: ' + agentName });
      await runCommand('docker build -t ' + agentName + ' .', targetDir, emit, 'build');
      dockerImage = agentName;
      runCmd = 'docker run -it ' + agentName;
      break;
    }
    case 'go': {
      const buildCmd = detection.buildCommand ?? 'go build -o ' + agentName + ' .';
      emit({ phase: 'build', message: 'Building: ' + buildCmd });
      await runCommand(buildCmd, targetDir, emit, 'build');
      binaryPath = path.join(targetDir, agentName);
      break;
    }
    case 'npm': {
      emit({ phase: 'build', message: 'Installing dependencies (npm install)...' });
      await runCommand('npm install', targetDir, emit, 'build');
      runCmd = 'npm start';
      break;
    }
    case 'pip': {
      emit({ phase: 'build', message: 'Installing Python package (pip install -e .)...' });
      await runCommand('pip install -e .', targetDir, emit, 'build');
      runCmd = 'python -m ' + agentName;
      break;
    }
    default: {
      // skill / manual: clone only, no build step
      emit({ phase: 'build', message: 'No build step required' });
      break;
    }
  }

  // 4. Record in database
  insertInstalledAgent({
    item_id: itemId,
    agent_name: agentName,
    agent_type: detection.type,
    install_path: targetDir,
    run_command: runCmd,
    binary_path: binaryPath,
    docker_image: dockerImage,
  });

  logger.info('install', 'done', 'Installed ' + agentName + ' to ' + targetDir + ' (' + detection.type + ')');
  emit({ phase: 'done', message: 'Installed to ' + targetDir });
}
