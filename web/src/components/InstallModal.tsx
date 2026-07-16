import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const tierColors: Record<string, { bg: string; fg: string }> = {
  A: { bg: 'rgba(158,206,106,.15)', fg: '#9ece6a' },
  B: { bg: 'rgba(224,175,104,.15)', fg: '#e0af68' },
  C: { bg: 'rgba(224,175,104,.15)', fg: '#e0af68' },
  D: { bg: 'rgba(166,175,199,.1)', fg: '#a6afc7' },
  E: { bg: 'rgba(125,207,255,.15)', fg: '#7dcfff' },
  F: { bg: 'rgba(166,175,199,.1)', fg: '#a6afc7' },
};

const riskColors: Record<string, string> = {
  green: '#9ece6a',
  yellow: '#e0af68',
  red: '#f7768e',
};

const riskLabels: Record<string, string> = {
  green: '\u5b89\u5168',
  yellow: '\u6ce8\u610f',
  red: '\u9ad8\u98ce\u9669',
};

export function InstallModal({ itemId, repoUrl, onClose }: {
  itemId: string;
  repoUrl: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [installing, setInstalling] = useState(false);

  const { data: check, isLoading } = useQuery({
    queryKey: ['install-check', itemId],
    queryFn: () => api.install.check(itemId),
  });

  const { data: installedList } = useQuery({
    queryKey: ['install-status'],
    queryFn: () => api.install.status(),
  });

  const skillName = check?.compatibility?.skillName;
  const alreadyInstalled = installedList?.installed?.some(
    (s) => s.item_id === itemId || (skillName && s.skill_name === skillName),
  ) ?? false;

  const runMut = useMutation({
    mutationFn: () => api.install.run(itemId),
    onSuccess: () => {
      setInstalling(false);
      qc.invalidateQueries({ queryKey: ['install-status'] });
    },
    onError: () => setInstalling(false),
  });

  const removeMut = useMutation({
    mutationFn: (skillName: string) => api.install.remove(skillName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['install-status'] });
    },
  });

  const compat = check?.compatibility;
  const scan = check?.scan;
  const isRed = scan?.riskLevel === 'red';
  const tierColor = compat ? tierColors[compat.tier] ?? tierColors.D : tierColors.D;

  const allFindings = scan ? [
    ...scan.stages.s1?.findings ?? [],
    ...scan.stages.s2?.findings ?? [],
    ...scan.stages.s3?.findings ?? [],
    ...scan.stages.s4?.findings ?? [],
    ...scan.stages.s5?.findings ?? [],
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-lg my-4 rounded-xl border border-border-lt bg-surface overflow-hidden" onClick={(e) => e.stopPropagation()}>

        <div className="relative p-5 border-b border-border">
          <button className="absolute right-4 top-4 text-muted hover:text-fg text-xl leading-none" onClick={onClose}>&times;</button>
          <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-1">{'\u5b89\u88c5\u68c0\u67e5'}</div>
        </div>

        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted text-xs">{'\u68c0\u6d4b\u4e2d'}...</div>
          ) : check ? (
            <>
              {/* Already installed banner */}
              {alreadyInstalled && (
                <div className="rounded-md border border-[#9ece6a]/40 bg-[#9ece6a]/10 p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[12px] text-[#9ece6a] font-semibold">{'\u2713 \u5df2\u5b89\u88c5'}</div>
                    <p className="text-[11px] text-muted mt-0.5">{'\u8be5\u6280\u80fd\u5df2\u5728\u4f60\u7684 Codex \u4e2d\uff0c\u53ef\u91cd\u65b0\u5b89\u88c5\u6216\u5378\u8f7d\u3002'}</p>
                  </div>
                  {skillName && (
                    <button
                      className="px-3 py-1 rounded-md text-[11px] border border-[#f7768e]/40 text-[#f7768e] hover:bg-[#f7768e]/10 flex-shrink-0"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate(skillName)}
                    >
                      {removeMut.isPending ? '...' : '\u5378\u8f7d'}
                    </button>
                  )}
                </div>
              )}

              {/* Compatibility tier */}
              {compat && (
                <div>
                  <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u517c\u5bb9\u6027'}</div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono" style={{ background: tierColor.bg, color: tierColor.fg }}>
                      {'Tier ' + compat.tier}
                    </span>
                    <span className="text-[12px] text-fg-dim">{compat.label}</span>
                  </div>
                  <p className="text-[11px] text-muted mt-1">{compat.reason}</p>
                </div>
              )}

              {/* Safety scan */}
              {scan && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[10px] text-muted uppercase tracking-wide">{'\u5b89\u5168\u626b\u63cf'}</span>
                    <span className="font-mono text-[11px] font-bold" style={{ color: riskColors[scan.riskLevel] }}>
                      {riskLabels[scan.riskLevel] ?? scan.riskLevel}
                    </span>
                    {scan.totalIssues > 0 && (
                      <span className="text-[10px] text-muted">{'(' + scan.totalIssues + ' \u9879)'}</span>
                    )}
                  </div>
                  {allFindings.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {allFindings.map((f, i) => (
                        <div key={i} className="text-[11px] text-fg-dim bg-black/30 rounded px-2 py-1 font-mono">
                          {'\u2022 ' + f}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-green">{'\u2713 \u672a\u53d1\u73b0\u95ee\u9898'}</div>
                  )}
                </div>
              )}

              {/* Red risk block message */}
              {isRed && (
                <div className="rounded-md border border-[#f7768e]/40 bg-[#f7768e]/10 p-3">
                  <div className="text-[12px] text-[#f7768e] font-semibold mb-1">{'\u26a0 \u9ad8\u98ce\u9669\uff0c\u5df2\u963b\u6b62\u5b89\u88c5'}</div>
                  <p className="text-[11px] text-fg-dim">{'\u8be5\u6280\u80fd\u5b58\u5728\u5b89\u5168\u98ce\u9669\uff0c\u4e0d\u652f\u6301\u4e00\u952e\u5b89\u88c5\u3002\u8bf7\u524d\u5f80 GitHub \u67e5\u770b\u5e76\u624b\u52a8\u8bc4\u4f30\u3002'}</p>
                </div>
              )}

              {/* Install success */}
              {runMut.isSuccess && runMut.data && (
                <div className="rounded-md border border-green/40 bg-green/10 p-3">
                  <div className="text-[12px] text-green font-semibold">{'\u2713 \u5b89\u88c5\u6210\u529f'}</div>
                  <p className="text-[11px] text-fg-dim mt-1 font-mono">{runMut.data.skillPath}</p>
                  <p className="text-[10px] text-muted mt-0.5">{'\u5df2\u5b89\u88c5 ' + runMut.data.filesWritten + ' \u4e2a\u6587\u4ef6\uff08' + runMut.data.method + '\uff09'}</p>
                </div>
              )}

              {runMut.isError && (
                <div className="rounded-md border border-[#f7768e]/40 bg-[#f7768e]/10 p-3">
                  <div className="text-[12px] text-[#f7768e] font-semibold">{'\u5b89\u88c5\u5931\u8d25'}</div>
                  <p className="text-[11px] text-fg-dim mt-1">{(runMut.error as Error)?.message}</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted text-xs">{'\u68c0\u6d4b\u5931\u8d25'}</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 p-5 pt-0 flex-wrap border-t border-border">
          {check && !isRed && check.installable && !runMut.isSuccess && (
            <button
              className="px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br disabled:opacity-50"
              disabled={installing || runMut.isPending}
              onClick={() => { setInstalling(true); runMut.mutate(); }}
            >
              {(installing || runMut.isPending)
                ? '\u5b89\u88c5\u4e2d...'
                : (alreadyInstalled ? '\u91cd\u65b0\u5b89\u88c5' : '\u786e\u8ba4\u5b89\u88c5')}
            </button>
          )}
          {repoUrl && (
            <a href={repoUrl} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg">
              {'GitHub \u67e5\u770b'}
            </a>
          )}
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg">
            {'\u5173\u95ed'}
          </button>
        </div>
      </div>
    </div>
  );
}
