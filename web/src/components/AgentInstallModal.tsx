import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { InstallLog, type LogLine } from './InstallLog';

interface Prerequisite {
  name: string;
  installed: boolean;
  version: string | null;
  install_url: string | null;
  install_hint: string | null;
}

interface EnvCheckResult {
  is_skill?: boolean;
  detected_type: string;
  prerequisites: Prerequisite[];
  all_met: boolean;
  blocked_by: string[];
}

interface AgentInstallModalProps {
  itemId: string;
  repoName: string;
  repoUrl: string;
  onClose: () => void;
}

// Human-readable summary of what the installer will do for a project type.
function buildSummary(detectedType: string): string {
  const t = detectedType.toLowerCase();
  if (t === 'go' || t === 'golang') return 'Clone repo -> Build binary';
  if (t === 'node' || t === 'nodejs' || t === 'typescript' || t === 'javascript') return 'Clone repo -> npm install';
  if (t === 'python' || t === 'py') return 'Clone repo -> pip install';
  if (t === 'rust') return 'Clone repo -> cargo build';
  return 'Clone repo -> Build';
}

// Suggested run command for after a successful install, keyed by detected type.
function runCommand(detectedType: string): string {
  const t = detectedType.toLowerCase();
  if (t === 'go' || t === 'golang') return 'go run .';
  if (t === 'node' || t === 'nodejs' || t === 'typescript' || t === 'javascript') return 'npm start';
  if (t === 'python' || t === 'py') return 'python main.py';
  if (t === 'rust') return 'cargo run';
  return './run';
}

export function AgentInstallModal({ itemId, repoName, repoUrl, onClose }: AgentInstallModalProps) {
  const [step, setStep] = useState(1); // 1=detect, 2=config, 3=install
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [installPath, setInstallPath] = useState('');
  const [drives, setDrives] = useState<string[]>([]);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState(false);

  // Step 1: detect environment on mount and on manual re-check.
  const runCheckEnv = useCallback(() => {
    setEnvLoading(true);
    setEnvError(null);
    api.agent
      .checkEnv(itemId)
      .then((res) => setEnvResult(res))
      .catch((err: Error) => setEnvError(err.message))
      .finally(() => setEnvLoading(false));
  }, [itemId]);

  useEffect(() => {
    runCheckEnv();
  }, [runCheckEnv]);

  // Step 2: load default path + drives when entering the config step.
  useEffect(() => {
    if (step !== 2) return;
    api.agent
      .defaultPath()
      .then((res) => {
        setInstallPath(res.path);
        setDrives(res.drives);
      })
      .catch(() => {
        /* keep empty defaults */
      });
  }, [step]);

  // Replace the drive prefix of the current path when a drive button is clicked.
  const selectDrive = (drive: string) => {
    setInstallPath((prev) => drive + prev.replace(/^[A-Za-z]:/, ''));
  };

  // Step 3: open the SSE install stream and feed parsed events into the log.
  const startInstall = async () => {
    setStep(3);
    setIsStreaming(true);
    setInstallDone(false);
    setInstallError(false);
    setLogLines([]);
    const stream = await api.agent.install(itemId, installPath).catch(() => null);
    if (!stream) {
      setInstallError(true);
      setIsStreaming(false);
      return;
    }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { phase: string; message: string };
          setLogLines((prev) => [...prev, { phase: event.phase, message: event.message }]);
          if (event.phase === 'done') {
            setInstallDone(true);
            setIsStreaming(false);
            finished = true;
          } else if (event.phase === 'error') {
            setInstallError(true);
            setIsStreaming(false);
            finished = true;
          }
        } catch {
          /* skip malformed event */
        }
      }
    }
  };

  const diagnoseLines = logLines.filter((l) => l.phase === 'diagnose');
  const stepLabels = ['\u68c0\u6d4b', '\u914d\u7f6e', '\u5b89\u88c5'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border-lt bg-surface overflow-hidden" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="relative p-5 border-b border-border">
          <button className="absolute right-4 top-4 text-muted hover:text-fg text-xl leading-none" onClick={onClose}>&times;</button>
          <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-1">{'\u5b89\u88c5\u5411\u5bfc'}</div>
          <h2 className="text-sm font-semibold text-fg pr-8 break-all">{repoName}</h2>
          {repoUrl && <div className="text-[11px] text-muted mt-1 font-mono break-all">{repoUrl}</div>}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          {[1, 2, 3].map((n) => {
            const active = step === n;
            const passed = step > n;
            return (
              <div key={n} className="flex items-center gap-2">
                <span
                  className={
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ' +
                    (active ? 'bg-amber text-bg' : passed ? 'bg-green/20 text-green' : 'bg-black/40 text-muted')
                  }
                >
                  {passed ? '\u2713' : n}
                </span>
                <span className={'text-[11px] ' + (active ? 'text-fg' : 'text-muted')}>{stepLabels[n - 1]}</span>
                {n < 3 && <span className="text-muted mx-1">{'\u203a'}</span>}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {step === 1 && (
            <>
              {envLoading && (
                <div className="text-center py-8 text-muted text-xs">{'\u68c0\u6d4b\u4e2d'}...</div>
              )}
              {!envLoading && envError && (
                <div className="rounded-md border border-[#f7768e]/40 bg-[#f7768e]/10 p-3">
                  <div className="text-[12px] text-[#f7768e] font-semibold">{'\u68c0\u6d4b\u5931\u8d25'}</div>
                  <p className="text-[11px] text-fg-dim mt-1 break-all">{envError}</p>
                </div>
              )}
              {!envLoading && envResult && (
                <>
                  {/* Detected project type */}
                  <div>
                    <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u9879\u76ee\u7c7b\u578b'}</div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono" style={{ background: 'rgba(122,162,247,.15)', color: '#7aa2f7' }}>
                      {envResult.detected_type || '--'}
                    </span>
                  </div>

                  {/* Prerequisites */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-[10px] text-muted uppercase tracking-wide">{'\u73af\u5883\u4f9d\u8d56'}</span>
                      <span className="font-mono text-[11px] font-bold" style={{ color: envResult.all_met ? '#9ece6a' : '#f7768e' }}>
                        {envResult.all_met ? '\u5168\u90e8\u6ee1\u8db3' : '\u7f3a\u5c11\u4f9d\u8d56'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {envResult.prerequisites.map((p) => (
                        <div key={p.name} className="flex items-start gap-2 bg-black/30 rounded px-2.5 py-1.5">
                          <span className="flex-shrink-0 text-[12px] leading-5" style={{ color: p.installed ? '#9ece6a' : '#f7768e' }}>
                            {p.installed ? '\u2713' : '\u2717'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-fg font-mono">{p.name}</span>
                              {p.version && <span className="text-[10px] text-muted font-mono">{p.version}</span>}
                              <span className={'text-[10px] ' + (p.installed ? 'text-green' : 'text-[#f7768e]')}>
                                {p.installed ? '\u5df2\u5b89\u88c5' : '\u672a\u5b89\u88c5'}
                              </span>
                            </div>
                            {!p.installed && (p.install_hint || p.install_url) && (
                              <div className="mt-0.5 text-[11px] text-muted break-all">
                                {p.install_hint && <span>{p.install_hint}</span>}
                                {p.install_url && (
                                  <a href={p.install_url} target="_blank" rel="noreferrer" className="text-blue hover:underline ml-1 font-mono break-all">{p.install_url}</a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u5b89\u88c5\u8def\u5f84'}</div>
                <input
                  type="text"
                  value={installPath}
                  onChange={(e) => setInstallPath(e.target.value)}
                  spellCheck={false}
                  className="w-full bg-black/40 border border-border rounded-md px-3 py-2 text-xs font-mono text-fg focus:outline-none focus:border-amber"
                />
              </div>

              {drives.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u9009\u62e9\u78c1\u76d8'}</div>
                  <div className="flex gap-2">
                    {drives.map((d) => {
                      const current = new RegExp('^' + d, 'i').test(installPath);
                      return (
                        <button
                          key={d}
                          onClick={() => selectDrive(d)}
                          className={
                            'px-3 py-1 rounded-md text-[11px] font-mono ' +
                            (current ? 'bg-amber text-bg border border-amber' : 'border border-border text-fg-dim hover:border-border-lt hover:text-fg')
                          }
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="rounded-md border border-border bg-black/20 p-3">
                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                  <span className="text-muted font-mono">{'\u7c7b\u578b'}</span>
                  <span className="text-fg font-mono">{envResult?.detected_type || '--'}</span>
                  <span className="text-muted">|</span>
                  <span className="text-muted font-mono">{'\u5c06\u8981\u6267\u884c'}</span>
                  <span className="text-amber font-mono">{buildSummary(envResult?.detected_type || '')}</span>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {diagnoseLines.length > 0 && (
                <div className="rounded-md border border-[#bb9af7]/40 bg-[#bb9af7]/10 p-3">
                  <div className="text-[11px] text-[#bb9af7] font-semibold mb-1">{'AI \u5efa\u8bae'}</div>
                  <p className="text-[11px] text-fg-dim break-all">{diagnoseLines[diagnoseLines.length - 1].message}</p>
                </div>
              )}

              <InstallLog lines={logLines} isStreaming={isStreaming} />

              {installDone && (
                <div className="rounded-md border border-green/40 bg-green/10 p-3">
                  <div className="text-[12px] text-green font-semibold">{'\u2713 \u5b89\u88c5\u6210\u529f'}</div>
                  {installPath && (
                    <p className="text-[11px] text-fg-dim mt-1 font-mono break-all">{'\u5df2\u5b89\u88c5\u5230 ' + installPath}</p>
                  )}
                  <div className="mt-2">
                    <span className="font-mono text-[10px] text-muted">{'\u8fd0\u884c\u547d\u4ee4'}</span>
                    <pre className="bg-black/40 border border-border rounded-md px-3 py-2 mt-1 text-[11px] font-mono text-green overflow-x-auto">{runCommand(envResult?.detected_type || '')}</pre>
                  </div>
                </div>
              )}

              {installError && (
                <div className="rounded-md border border-[#f7768e]/40 bg-[#f7768e]/10 p-3">
                  <div className="text-[12px] text-[#f7768e] font-semibold">{'\u5b89\u88c5\u5931\u8d25'}</div>
                  <p className="text-[11px] text-fg-dim mt-1">{'\u8bf7\u68c0\u67e5\u4f9d\u8d56\u73af\u5883\u540e\u91cd\u8bd5\u3002'}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0 flex-wrap border-t border-border">
          {step === 1 && (
            <>
              <button
                onClick={runCheckEnv}
                disabled={envLoading}
                className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg disabled:opacity-50"
              >
                {envLoading ? '\u68c0\u6d4b\u4e2d...' : '\u91cd\u65b0\u68c0\u6d4b'}
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={envResult?.all_met !== true}
                className="ml-auto px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {'\u4e0b\u4e00\u6b65'}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                onClick={() => setStep(1)}
                className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg"
              >
                {'\u4e0a\u4e00\u6b65'}
              </button>
              <button
                onClick={startInstall}
                disabled={!installPath.trim()}
                className="ml-auto px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br disabled:opacity-40"
              >
                {'\u5f00\u59cb\u5b89\u88c5'}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              {installError && (
                <button
                  onClick={startInstall}
                  className="px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br"
                >
                  {'\u91cd\u8bd5'}
                </button>
              )}
              <button
                onClick={onClose}
                className="ml-auto px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg"
              >
                {'\u5173\u95ed'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
