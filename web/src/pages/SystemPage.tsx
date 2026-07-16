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

  return (
    <div className="p-4 max-w-2xl flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <button
          className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br"
          onClick={() => collectMut.mutate()}
          disabled={collectMut.isPending}
        >
          {collectMut.isPending ? '抓取中...' : '立即抓取'}
        </button>
        {collectMut.isSuccess && <span className="text-[11px] text-green">{'\u62D3\u53D6\u5B8C\u6210'}</span>}
      </div>

      <div className="flex items-center gap-4">
        <button
          className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br"
          onClick={() => interpretMut.mutate()}
          disabled={interpretMut.isPending}
        >
          {interpretMut.isPending ? '...' : 'LLM'}
        </button>
        {interpretMut.isSuccess && <span className="text-[11px] text-green">{'\u7FFB\u8BD1\u5B8C\u6210'}</span>}
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">健康状态</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">数据库条数</div>
            <div className="font-mono text-lg text-fg font-semibold">{health?.db_items ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">上次抓取</div>
            <div className="font-mono text-[11px] text-fg-dim mt-1.5">{health?.last_collect ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">{'\u5F85\u7FFB\u8BD1'}</div>
            <div className="font-mono text-lg text-fg font-semibold">{health?.uninterpreted_count ?? '--'}</div>
          </div>
          <div className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">GitHub Token</div>
            <div className="font-mono text-sm mt-1" style={{ color: health?.github_token ? '#9ece6a' : '#f7768e' }}>
              {health?.github_token ? '已配置' : '未配置'}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">近期日志</div>
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