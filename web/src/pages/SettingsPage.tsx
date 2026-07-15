import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ScoreWeights } from '@shared/types';

const DIM_LABELS: Record<keyof ScoreWeights, string> = {
  star_velocity: 'Star 增速',
  activity: '维护活跃',
  fork_ratio: 'Fork 比',
  author_reputation: '作者信誉',
  issue_health: 'Issue 健康',
};

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [weights, setWeights] = useState<ScoreWeights | null>(null);
  const [threshold, setThreshold] = useState(20);

  const currentWeights = weights ?? settings?.score_weights ?? null;
  const currentThreshold = threshold ?? settings?.score_threshold ?? 20;

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateSettings(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });

  if (!settings) return <div className="text-center py-10 text-muted text-xs">加载中...</div>;

  const weightSum = currentWeights ? Object.values(currentWeights).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-4 max-w-xl flex flex-col gap-5">
      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">打分权重</div>
        <div className="flex flex-col gap-3">
          {currentWeights && Object.entries(currentWeights).map(([key, val]) => {
            const k = key as keyof ScoreWeights;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="text-xs text-fg-dim w-20">{DIM_LABELS[k]}</span>
                <input type="range" min={0} max={1} step={0.05} value={val}
                  onChange={e => { const nw = { ...currentWeights, [k]: Number(e.target.value) }; setWeights(nw); }}
                  className="flex-1 accent-amber" />
                <span className="font-mono text-xs text-fg-dim w-10 text-right">{val.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] font-mono" style={{ color: Math.abs(weightSum - 1) < 0.01 ? '#9ece6a' : '#f7768e' }}>
          权重总和: {weightSum.toFixed(2)} {Math.abs(weightSum - 1) < 0.01 ? '' : '(建议 1.0)'}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">显示阈值</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-dim w-20">最低分数</span>
          <input type="range" min={0} max={100} step={5} value={currentThreshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="flex-1 accent-amber" />
          <span className="font-mono text-xs text-fg-dim w-10 text-right">{currentThreshold}</span>
        </div>
        <div className="text-[11px] text-muted mt-1">低于此分数的项目将被隐藏</div>
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">抓取设置</div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-fg-dim w-20">抓取间隔</span>
          <span className="font-mono text-xs text-fg-dim">{settings.fetch_interval_hours} 小时</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-dim w-20">GitHub Token</span>
          <span className="font-mono text-xs" style={{ color: settings.github_token ? '#9ece6a' : '#f7768e' }}>
            {settings.github_token ? '已配置' : '未配置'}
          </span>
        </div>
      </div>

      <button
        className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br self-start"
        onClick={() => saveMutation.mutate({ score_weights: currentWeights, score_threshold: currentThreshold })}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? '保存中...' : '保存并重新打分'}
      </button>
      {saveMutation.isSuccess && <div className="text-[11px] text-green">已保存并重新打分</div>}
    </div>
  );
}