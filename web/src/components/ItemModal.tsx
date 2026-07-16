import { useState } from 'react';
import type { Item } from '@shared/types';
import { RadarChart, ScoreBars } from './RadarChart';
import { InstallModal } from './InstallModal';
import { getGithubMeta, getHNMeta, getRSSMeta } from '../lib/rawData';

function scoreColor(s: number): string {
  if (s >= 85) return '#e0af68';
  if (s >= 70) return '#c9a253';
  if (s >= 50) return '#94784a';
  return '#5e5236';
}
function fmtN(n: number): string {
  if (!n) return '--';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

const TAG_COLORS = [
  { bg: 'rgba(122,162,247,.15)', fg: '#7aa2f7' },
  { bg: 'rgba(187,154,247,.15)', fg: '#bb9af7' },
  { bg: 'rgba(125,207,255,.15)', fg: '#7dcfff' },
  { bg: 'rgba(158,206,106,.15)', fg: '#9ece6a' },
  { bg: 'rgba(224,175,104,.15)', fg: '#e0af68' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{children}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted font-mono text-[10px]">{label}</span>
      <span className="text-fg-dim font-mono text-[11px]">{value}</span>
    </div>
  );
}

export function ItemModal({ item, onClose, onFav }: {
  item: Item;
  onClose: () => void;
  onFav?: (id: string) => void;
}) {
  const [showInstall, setShowInstall] = useState(false);
  const isGithub = item.source_type === 'github';
  const isNews = item.source_type === 'rss' || item.source_type === 'hackernews';

  const ghMeta = isGithub ? getGithubMeta(item.raw_data) : null;
  const hnMeta = item.source_type === 'hackernews' ? getHNMeta(item.raw_data) : null;
  const rssMeta = item.source_type === 'rss' ? getRSSMeta(item.raw_data) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-2xl my-4 rounded-xl border border-border-lt bg-surface overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative p-5 border-b border-border">
          <button className="absolute right-4 top-4 text-muted hover:text-fg text-xl leading-none" onClick={onClose}>&times;</button>

          {/* Source badge */}
          <div className="mb-2">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono" style={{
              background: isGithub ? 'rgba(158,206,106,.2)' : isNews ? 'rgba(224,175,104,.2)' : 'rgba(122,162,247,.2)',
              color: isGithub ? '#9ece6a' : isNews ? '#e0af68' : '#7aa2f7',
            }}>
              {isGithub ? 'GITHUB' : isNews ? (item.source_type === 'hackernews' ? 'HACKER NEWS' : 'RSS') : item.source_type.toUpperCase()}
            </span>
          </div>

          <h2 className="text-base font-semibold text-fg pr-8 leading-relaxed">{item.title_zh ?? item.title}</h2>
          {item.title_zh && <div className="text-[11px] text-muted mt-1 font-mono break-all">{item.title}</div>}

          {/* Topic tags */}
          {ghMeta?.topics && ghMeta.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {ghMeta.topics.map((t, i) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
                  style={{ background: TAG_COLORS[i % TAG_COLORS.length].bg, color: TAG_COLORS[i % TAG_COLORS.length].fg }}
                >{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">

          {/* Chinese summary (LLM interpreted) */}
          {item.summary && (
            <div>
              <SectionLabel>{'\u6458\u8981'}</SectionLabel>
              <p className="text-[13px] text-fg-dim leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Original description for GitHub */}
          {ghMeta?.description && (
            <div>
              <SectionLabel>{'\u539F\u6587\u63CF\u8FF0'}</SectionLabel>
              <p className="text-[12px] text-muted leading-relaxed font-mono">{ghMeta.description}</p>
            </div>
          )}

          {/* News full content */}
          {isNews && (hnMeta?.story_text || rssMeta?.content) && (
            <div>
              <SectionLabel>{'\u6B63\u6587'}</SectionLabel>
              <p className="text-[12px] text-fg-dim leading-relaxed">
                {(hnMeta?.story_text || rssMeta?.contentSnippet || rssMeta?.content || '')
                  .replace(/<[^>]+>/g, '').slice(0, 500)}
              </p>
            </div>
          )}

          {/* Score section: GitHub skills only */}
          {isGithub && item.score_detail && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <SectionLabel>{'\u8BC4\u5206'}</SectionLabel>
                <span className="font-mono text-sm font-bold" style={{ color: scoreColor(item.score) }}>{item.score} {'\u5206'}</span>
              </div>
              <div className="grid grid-cols-[160px_1fr] gap-3 items-center">
                <RadarChart d={item.score_detail} />
                <ScoreBars d={item.score_detail} />
              </div>
            </div>
          )}

          {/* Metrics: GitHub */}
          {isGithub && (
            <div>
              <SectionLabel>{'\u8BE6\u7EC6\u6570\u636E'}</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Metric label="Stars" value={fmtN(item.stars)} />
                <Metric label="Forks" value={fmtN(item.forks)} />
                <Metric label={'\u8BED\u8A00'} value={ghMeta?.language || item.lang || '--'} />
                <Metric label={'\u5F00\u653E Issue'} value={String(ghMeta?.open_issues_count ?? '--')} />
                {ghMeta?.license && <Metric label={'\u534F\u8BAE'} value={ghMeta.license} />}
                {ghMeta?.archived !== undefined && <Metric label={'\u72B6\u6001'} value={ghMeta.archived ? '\u5DF2\u5F52\u6863' : '\u6D3B\u8DC3'} />}
                <Metric label={'\u521B\u5EFA'} value={ghMeta?.created_at?.slice(0, 10) ?? '--'} />
                <Metric label={'\u6700\u8FD1\u63A8\u9001'} value={ghMeta?.pushed_at?.slice(0, 10) ?? item.pushed_at?.slice(0, 10) ?? '--'} />
              </div>
            </div>
          )}

          {/* Metrics: News */}
          {isNews && (
            <div>
              <SectionLabel>{'\u4FE1\u606F'}</SectionLabel>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {hnMeta && <Metric label={'\u70ED\u5EA6'} value={fmtN(hnMeta.points ?? item.stars)} />}
                {hnMeta && <Metric label={'\u8BC4\u8BBA'} value={fmtN(hnMeta.num_comments ?? item.forks)} />}
                <Metric label={'\u6765\u6E90'} value={hnMeta?.author ?? rssMeta?.source ?? rssMeta?.creator ?? item.author ?? '--'} />
                <Metric label={'\u65F6\u95F4'} value={(item.pushed_at ?? item.updated_at)?.slice(0, 10) ?? '--'} />
              </div>
            </div>
          )}

          {/* Homepage link */}
          {ghMeta?.homepage && (
            <div>
              <SectionLabel>{'\u4E3B\u9875'}</SectionLabel>
              <a href={ghMeta.homepage} target="_blank" rel="noreferrer" className="text-blue hover:underline text-xs font-mono break-all">{ghMeta.homepage}</a>
            </div>
          )}

          {/* Source link */}
          {item.url && (
            <div>
              <SectionLabel>{'\u94FE\u63A5'}</SectionLabel>
              <a href={item.url} target="_blank" rel="noreferrer" className="text-blue hover:underline text-xs font-mono break-all">{item.url}</a>
            </div>
          )}

          {/* Install command for GitHub skills */}
          {isGithub && (
            <div>
              <SectionLabel>{'\u5B89\u88C5\u547D\u4EE4'}</SectionLabel>
              <pre className="bg-black/40 border border-border rounded-md px-3 py-2 text-xs font-mono text-green overflow-x-auto">codex skill install github:{item.source_id}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 pt-0 flex-wrap border-t border-border">
          {onFav && (
            <button
              className={'px-3.5 py-1.5 rounded-md text-xs ' + (item.is_favorited ? '' : 'border border-border text-fg-dim hover:border-border-lt hover:text-fg')}
              style={item.is_favorited ? { background: '#9ece6a', color: '#0d0f17', border: 'none' } : {}}
              onClick={() => onFav(item.id)}
            >
              {item.is_favorited ? '\u2713 \u5DF2\u6536\u85CF' : '\u2606 \u6536\u85CF'}
            </button>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg">
              {'\u6253\u5F00\u94FE\u63A5'}
            </a>
          )}
          {isGithub && (
            <button className="px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br" onClick={() => setShowInstall(true)}>
              {'\u5B89\u88C5\u5230 Codex'}
            </button>
          )}
        </div>
      </div>
      {showInstall && (
        <InstallModal itemId={item.id} repoUrl={item.url} onClose={() => setShowInstall(false)} />
      )}
    </div>
  );
}
