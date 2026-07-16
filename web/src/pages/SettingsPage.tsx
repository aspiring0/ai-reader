import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ScoreWeights, ProviderPreset } from '@shared/types';

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
  const { data: providersData } = useQuery({ queryKey: ['llm-providers'], queryFn: api.llm.providers });
  const [weights, setWeights] = useState<ScoreWeights | null>(null);
  const [threshold, setThreshold] = useState(20);
  const [llmProvider, setLlmProvider] = useState('');
  const [llmKey, setLlmKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [llmTimeout, setLlmTimeout] = useState(30000);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchModelError, setFetchModelError] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const currentWeights = weights ?? settings?.score_weights ?? null;
  const currentThreshold = threshold ?? settings?.score_threshold ?? 20;
  const currentLlmModel = llmModel || settings?.llm_model || '';
  const currentLlmBaseUrl = llmBaseUrl || settings?.llm_base_url || '';
  const currentLlmTimeout = llmTimeout || settings?.llm_timeout_ms || 30000;
  const currentProvider = llmProvider || settings?.llm_provider || 'zhipu';
  const providers = providersData?.providers ?? [];
  const selectedProvider = providers.find((p) => p.id === currentProvider);
  const isCustom = currentProvider === 'custom';

  // Key checkmark: only show when the saved key belongs to the current provider
  const savedProviderMatches = (settings?.llm_provider || 'zhipu') === currentProvider;
  const hasSavedKey = !!settings?.llm_api_key && savedProviderMatches;

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateSettings(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });

  const fetchModelsMutation = useMutation({
    mutationFn: (body: { base_url?: string; api_key?: string }) => api.llm.models(body),
    onSuccess: (data) => {
      if (data.error) { setFetchModelError(data.error); setFetchedModels([]); }
      else { setFetchedModels(data.models); setFetchModelError(''); }
    },
    onError: (err) => { setFetchModelError(err instanceof Error ? err.message : String(err)); },
  });

  const testMutation = useMutation({
    mutationFn: (body: { model?: string; api_key?: string; base_url?: string }) => api.llm.test(body),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ success: false, message: err instanceof Error ? err.message : String(err) }),
  });

  function handleProviderChange(providerId: string): void {
    const preset = providers.find((p) => p.id === providerId);
    setLlmProvider(providerId);
    // Clear key, model, and fetched models when switching providers
    setLlmKey('');
    setLlmModel('');
    setFetchedModels([]);
    setFetchModelError('');
    setTestResult(null);
    if (preset && preset.id !== 'custom') {
      setLlmBaseUrl(preset.base_url);
    }
  }

  if (!settings) return <div className="text-center py-10 text-muted text-xs">{'\u52A0\u8F7D\u4E2D'}...</div>;

  const weightSum = currentWeights ? Object.values(currentWeights).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="p-4 max-w-xl flex flex-col gap-5">
      {/* Scoring weights */}
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

      {/* Score threshold */}
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

      {/* Collect settings */}
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

      {/* LLM config */}
      <div>
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">LLM {'\u914D\u7F6E'}</div>
        <div className="flex flex-col gap-3">
          {/* Provider dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">{'\u5382\u5546'}</span>
            <select
              value={currentProvider}
              onChange={e => handleProviderChange(e.target.value)}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber"
            >
              {providers.map((p: ProviderPreset) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          {selectedProvider && selectedProvider.key_required && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-fg-dim w-20">{selectedProvider.key_label}</span>
              <input type="password"
                placeholder={hasSavedKey ? '****** (\u5DF2\u4FDD\u5B58)' : selectedProvider.key_placeholder}
                value={llmKey}
                onChange={e => { setLlmKey(e.target.value); setFetchedModels([]); setFetchModelError(''); }}
                className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber" />
              <span className="font-mono text-xs" style={{ color: (llmKey || hasSavedKey) ? '#9ece6a' : '#f7768e' }}>
                {(llmKey || hasSavedKey) ? '\u2713' : '\u2717'}
              </span>
            </div>
          )}

          {/* Base URL */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">Base URL</span>
            <input type="text"
              value={currentLlmBaseUrl}
              onChange={e => setLlmBaseUrl(e.target.value)}
              readOnly={!isCustom}
              placeholder={isCustom ? 'https://your-provider.com/v1' : ''}
              className={'flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono ' + (isCustom ? '' : 'opacity-60 cursor-not-allowed')} />
          </div>

          {/* Model: fetch button + dropdown/manual input */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-fg-dim w-20">{'\u6A21\u578B'}</span>
              {isCustom || fetchedModels.length > 0 ? (
                fetchedModels.length > 0 ? (
                  <select
                    value={currentLlmModel}
                    onChange={e => setLlmModel(e.target.value)}
                    className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber"
                  >
                    {currentLlmModel && !fetchedModels.includes(currentLlmModel) && (
                      <option value={currentLlmModel}>{currentLlmModel} ({'\u5DF2\u4FDD\u5B58'})</option>
                    )}
                    {fetchedModels.map((m: string) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : isCustom ? (
                  <input type="text" placeholder="model name"
                    value={currentLlmModel}
                    onChange={e => setLlmModel(e.target.value)}
                    className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono" />
                ) : null
              ) : (
                <div className="flex-1 flex items-center gap-2">
                  {currentLlmModel && (
                    <span className="font-mono text-xs text-fg-dim bg-surface2 px-2 py-1 rounded">{currentLlmModel}</span>
                  )}
                  <button
                    className="px-3 py-1.5 rounded-md bg-surface2 text-fg text-xs font-semibold hover:bg-surface2/80 border border-border whitespace-nowrap"
                   onClick={() => {
                     setFetchModelError('');
                     fetchModelsMutation.mutate({
                       base_url: currentLlmBaseUrl,
                       api_key: llmKey || undefined,
                     });
                   }}
                    disabled={fetchModelsMutation.isPending || (!!selectedProvider?.key_required && !llmKey && !hasSavedKey)}
                  >
                    {fetchModelsMutation.isPending ? '\u83B7\u53D6\u4E2D...' : '\u83B7\u53D6\u6A21\u578B\u5217\u8868'}
                  </button>
                </div>
              )}
            </div>
            {fetchModelError && (
              <span className="font-mono text-xs text-red ml-20">{'\u2717'} {fetchModelError}</span>
            )}
            {fetchedModels.length > 0 && !isCustom && (
              <button
                className="text-[11px] text-blue hover:underline w-fit ml-20"
                onClick={() => { setFetchedModels([]); setLlmModel(''); }}
              >
                {'\u91CD\u65B0\u83B7\u53D6'}
              </button>
            )}
          </div>

          {/* Timeout */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-dim w-20">{'\u8D85\u65F6(ms)'}</span>
            <input type="number" min={5000} max={120000} step={5000}
              value={currentLlmTimeout}
              onChange={e => setLlmTimeout(Number(e.target.value))}
              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber font-mono" />
          </div>

          {/* Docs link */}
         {selectedProvider && selectedProvider.docs_url && (
           <a href={selectedProvider.docs_url} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-blue hover:underline w-fit">
              {selectedProvider.key_required
                ? selectedProvider.label + ' \u2192 API Key'
                : selectedProvider.label + ' \u6587\u6863'} {'\u2197'}
           </a>
         )}

          {/* Test connection */}
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 rounded-md bg-surface2 text-fg text-xs font-semibold hover:bg-surface2/80 border border-border"
              onClick={() => {
                setTestResult(null);
                testMutation.mutate({
                  model: currentLlmModel,
                  api_key: llmKey || undefined,
                  base_url: currentLlmBaseUrl || undefined,
                });
              }}
              disabled={testMutation.isPending || !currentLlmModel}
            >
              {testMutation.isPending ? '\u6D4B\u8BD5\u4E2D...' : '\u6D4B\u8BD5\u8FDE\u63A5'}
            </button>
            {testResult && (
              <span className="font-mono text-xs" style={{ color: testResult.success ? '#9ece6a' : '#f7768e' }}>
                {testResult.success ? '\u2713' : '\u2717'} {testResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Save */}
      <button
        className="px-4 py-2 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br self-start"
        onClick={() => {
          const body: Record<string, unknown> = { score_weights: currentWeights, score_threshold: currentThreshold, llm_provider: currentProvider };
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
