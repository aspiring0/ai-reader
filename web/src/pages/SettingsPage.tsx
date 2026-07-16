import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ScoreWeights } from '@shared/types';

const DIM_LABELS: Record<keyof ScoreWeights, string> = {
  star_velocity: 'Star \u589E\u901F',
  activity: '\u7EF4\u62A4\u6D3B\u8DC3',
  fork_ratio: 'Fork \u6BD4',
  author_reputation: '\u4F5C\u8005\u4FE1\u8A89',
  issue_health: 'Issue \u5065\u5EB7',
};

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [weights, setWeights] = useState<ScoreWeights | null>(null);
  const [threshold, setThreshold] = useState(20);
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmTimeout, setLlmTimeout] = useState(30000);

  const currentWeights = weights ?? settings?.score_weights ?? null;
  const currentThreshold = threshold ?? settings?.score_threshold ?? 20;
  const currentLlmModel = llmModel || settings?.llm_model || 'glm-4-plus';
  const currentLlmBaseUrl = llmBaseUrl || settings?.llm_base_url || 'https://open.bigmodel.cn/api/paas/v4';
  const currentLlmTimeout = llmTimeout || settings?.llm_timeout_ms || 30000;

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateSettings(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });

  if (!settings) return <div className="text-center py-10 text-muted text-xs">{'\u52A0\u8F7D\u4E2D'}...</div>;

  const weightSum = currentWeights ? Object.values(currentWeights).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="p-4 max-w-xl flex flex-col gap-5">
      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u6253\u5206\u6743\u91CD'}</div>
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
          {'\u6743\u91CD\u603B\u548C'}: {weightSum.toFixed(2)} {Math.abs(weightSum - 1) < 0.01 ? '' : '(\u5EFA\u8BAE 1.0)'}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u663E\u793A\u9608\u503C'}</div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-dim w-20">{'\u6700\u4F4E\u5206\u6570'}</span>
          <input type="range" min={0} max={100} step={5} value={currentThreshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="flex-1 accent-amber" />
          <span className="font-mono text-xs text-fg-dim w-10 text-right">{currentThreshold}</span>
        </div>
        <div className="text-[11px] text-muted mt-1">{'\u4F4E\u4E8E\u6B64\u5206\u6570\u7684\u9879\u76EE\u5C06\u88AB\u9690\u85CF'}</div>
      </div>

      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{'\u6293\u53D6\u8BBE\u7F6E'}</div>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-xs text-fg-dim w-20">{'\u6293\u53D6\u95F4\u9694'}</span>
          <span className="font-mono text-xs text-fg-dim">{settings.fetch_interval_hours} {'\u5C0F\u65F6'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-dim w-20">GitHub Token</span>
          <span className="font-mono text-xs" style={{ color: settings.github_token ? '#9ece6a' : '#f7768e' }}>
            {settings.github_token ? '\u5DF2\u914D\u7F6E' : '\u672A\u914D\u7F6E'}
          </span>
        </div>
      </div>

            <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">LLM {'\u914D\u7F6E'}</div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">API Key</span>
            <input type="password" placeholder={settings?.llm_api_key ? '******' : 'Zhipu API Key'}
              value={llmKey}
              onChange={e => setLlmKey(e.target.value)}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber" />
            <span className="font-mono text-xs" style={{ color: settings?.llm_api_key ? '#9ece6a' : '#f7768e' }}>
              {settings?.llm_api_key ? '\u2713' : '\u2717'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">{'\u6A21\u578B'}</span>
            <input type="text"
              value={currentLlmModel}
              onChange={e => setLlmModel(e.target.value)}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">Base URL</span>
            <input type="text"
              value={currentLlmBaseUrl}
              onChange={e => setLlmBaseUrl(e.target.value)}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">{'\u8D85\u65F6(ms)'}</span>
            <input type="number" min={5000} max={120000} step={5000}
              value={currentLlmTimeout}
              onChange={e => setLlmTimeout(Number(e.target.value))}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono" />
          </div>
        </div>
      </div>

      <button
        className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br self-start"
        onClick={() => {
          const body: Record<string, unknown> = { score_weights: currentWeights, score_threshold: currentThreshold };
          if (llmKey) body.llm_api_key = llmKey;
          if (llmModel) body.llm_model = currentLlmModel;
          if (llmBaseUrl) body.llm_base_url = currentLlmBaseUrl;
          if (llmTimeout) body.llm_timeout_ms = currentLlmTimeout;
          saveMutation.mutate(body);
        }}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? '\u4FDD\u5B58\u4E2D...' : '\u4FDD\u5B58\u5E76\u91CD\u65B0\u6253\u5206'}
      </button>
      {saveMutation.isSuccess && <div className="text-[11px] text-green">{'\u5DF2\u4FDD\u5B58\u5E76\u91CD\u65B0\u6253\u5206'}</div>}
    </div>
  );
}
