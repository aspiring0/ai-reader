import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const levelColor: Record<string, string> = { info: '#7aa2f7', warn: '#e0af68', error: '#f7768e' };

export function SystemPage() {
  const qc = useQueryClient();
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health });
  const { data: logs } = useQuery({ queryKey: ['logs'], queryFn: () => api.logs({ limit: 50 }) });
  const collectMut = useMutation({
    mutationFn: () => api.collect(),
    onSuccess: () => { qc.invalidateQueries(); },
  });
  const interpretMut = useMutation({
    mutationFn: () => api.interpretRun(),
    onSuccess: () => { qc.invalidateQueries(); },
  });
 const reinterpMut = useMutation({
   mutationFn: () => api.interpretRunForce(),
   onSuccess: () => { qc.invalidateQueries(); },
 });
  const { data: installStatus } = useQuery({ queryKey: ['install-status'], queryFn: () => api.install.status() });
 const uninstallMut = useMutation({
   mutationFn: (name: string) => api.install.remove(name),
   onSuccess: () => { qc.invalidateQueries({ queryKey: ['install-status'] }); },
 });
  const { data: agentStatus } = useQuery({ queryKey: ['agent-status'], queryFn: () => api.agent.status() });
  const agentUninstallMut = useMutation({
    mutationFn: (name: string) => api.agent.remove(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agent-status'] }); },
    onError: () => { qc.invalidateQueries({ queryKey: ['agent-status'] }); },
  });

return (
    <div className="p-4 max-w-2xl flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <button
          className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br"
          onClick={() => collectMut.mutate()}
          disabled={collectMut.isPending}
        >
          {collectMut.isPending ? '\u6293\u53D6\u4e2d...' : '\u7acb\u5373\u6293\u53d6'}
        </button>
        {collectMut.isSuccess && <span className="text-[11px] text-green">{'\u6293\u53d6\u5b8c\u6210'}</span>}
      </div>

      <div className="flex items-center gap-4">
        <button
          className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br"
          onClick={() => interpretMut.mutate()}
          disabled={interpretMut.isPending}
        >
          {interpretMut.isPending ? '\u7ffb\u8bd1\u4e2d...' : '\u7ffb\u8bd1\u65b0\u6570\u636e'}
        </button>
        {interpretMut.isSuccess && <span className="text-[11px] text-green">{'\u7ffb\u8bd1\u5b8c\u6210'}</span>}
      </div>

      <div className="flex items-center gap-4">
        <button
          className="px-4 py-2 rounded-md border border-border text-fg-dim text-xs font-semibold hover:border-border-lt hover:text-fg"
          onClick={() => reinterpMut.mutate()}
          disabled={reinterpMut.isPending}
        >
          {reinterpMut.isPending ? '\u542f\u52a8\u4e2d...' : '\u91cd\u65b0\u7ffb\u8bd1\u5168\u90e8'}
        </button>
        {reinterpMut.isSuccess && <span className="text-[11px] text-green">{'\u540e\u53f0\u91cd\u65b0\u7ffb\u8bd1\u5df2\u542f\u52a8'}</span>}
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u72b6\u6001'}</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">{'\u6570\u636e\u5e93\u6761\u6570'}</div>
            <div className="font-mono text-lg text-fg font-semibold">{health?.db_items ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">{'\u4e0a\u6b21\u6293\u53d6'}</div>
            <div className="font-mono text-[11px] text-fg-dim mt-1.5">{health?.last_collect ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">{'\u5f85\u7ffb\u8bd1'}</div>
            <div className="font-mono text-lg text-fg font-semibold">{health?.uninterpreted_count ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">GitHub Token</div>
            <div className="font-mono text-sm mt-1" style={{ color: health?.github_token ? '#9ece6a' : '#f7768e' }}>
              {health?.github_token ? '\u5df2\u914d\u7f6e' : '\u672a\u914d\u7f6e'}
            </div>
          </div>
       </div>
     </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u5df2\u5b89\u88c5\u6280\u80fd'}</div>
        {(installStatus?.installed ?? []).length === 0 ? (
          <div className="text-[11px] text-muted">{'\u8fd8\u6ca1\u6709\u5b89\u88c5\u7684\u6280\u80fd'}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(installStatus?.installed ?? []).map((s) => (
              <div key={s.skill_name} className="flex items-center justify-between gap-2 bg-surface border border-border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[12px] text-fg font-medium truncate">{s.skill_name}</div>
                  <div className="text-[10px] text-muted font-mono truncate">{s.skill_path}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.install_method && <span className="text-[9px] font-mono text-muted px-1.5 py-0.5 rounded bg-black/30">{s.install_method}</span>}
                  <span className="text-[10px] text-muted">{s.installed_at?.slice(0, 10)}</span>
                  <button
                    className="text-[10px] text-[#f7768e] hover:text-[#ff9bad] border border-[#f7768e]/30 hover:border-[#f7768e]/60 rounded px-1.5 py-0.5"
                    onClick={() => uninstallMut.mutate(s.skill_name)}
                    disabled={uninstallMut.isPending}
                  >{'\u5378\u8f7d'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u5df2\u5b89\u88c5 Agent'}</div>
        {(agentStatus?.installed ?? []).length === 0 ? (
          <div className="text-[11px] text-muted">{'\u8fd8\u6ca1\u6709\u5b89\u88c5\u7684 Agent'}</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(agentStatus?.installed ?? []).map((a) => (
              <div key={a.agent_name} className="flex items-center justify-between gap-2 bg-surface border border-border rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-fg font-medium truncate">{a.agent_name}</span>
                    <span className="text-[9px] font-mono text-blue px-1.5 py-0.5 rounded bg-black/30">{a.agent_type}</span>
                  </div>
                  <div className="text-[10px] text-muted font-mono truncate">{a.install_path}</div>
                  {a.run_command && <div className="text-[10px] text-green font-mono truncate">$ {a.run_command}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-muted">{a.installed_at?.slice(0, 10)}</span>
                  <button
                    className="text-[10px] text-[#f7768e] hover:text-[#ff9bad] border border-[#f7768e]/30 hover:border-[#f7768e]/60 rounded px-1.5 py-0.5"
                    onClick={() => agentUninstallMut.mutate(a.agent_name)}
                    disabled={agentUninstallMut.isPending}
                  >{'\u5378\u8f7d'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u8fd1\u671f\u65e5\u5fd7'}</div>
        <div className="font-mono text-[11px] leading-relaxed">
          {(logs ?? []).slice(0, 40).map((log, i) => (
            <div key={i} className="grid grid-cols-[64px_42px_54px_1fr_auto] gap-2 text-fg-dim py-px">
              <span className="text-muted">{log.ts?.slice(11, 19)}</span>
              <span className="font-semibold" style={{ color: levelColor[log.level] || '#c8d3f5' }}>{log.level.toUpperCase()}</span>
              <span className="text-muted">{log.category}</span>
              <span className="truncate">{log.message}</span>
              <span className="text-muted">{log.duration_ms ? (log.duration_ms / 1000).toFixed(1) + 's' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
