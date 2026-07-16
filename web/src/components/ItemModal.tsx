import type { Item } from '@shared/types';
import { RadarChart, ScoreBars } from './RadarChart';

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

export function ItemModal({ item, onClose, onFav }: {
  item: Item;
  onClose: () => void;
  onFav?: (id: string) => void;
}) {
  const isGithub = item.source_type === 'github';
  const isNews = item.source_type === 'rss' || item.source_type === 'hackernews';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border-lt bg-bg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header: title + score */}
        <div className="relative p-5 border-b border-border">
          <button className="absolute right-4 top-4 text-muted hover:text-fg text-xl leading-none" onClick={onClose}>&times;</button>
          <h2 className="text-base font-semibold text-fg pr-8 leading-relaxed">{item.title_zh ?? item.title}</h2>
          {item.title_zh && <div className="text-[11px] text-muted mt-1 font-mono">{item.title}</div>}
          <div className="flex items-center gap-3 mt-3">
            <span className="font-mono text-2xl font-bold" style={{ color: scoreColor(item.score) }}>{item.score}</span>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold font-mono" style={{
              background: isGithub ? 'rgba(158,206,106,.2)' : isNews ? 'rgba(224,175,104,.2)' : 'rgba(122,162,247,.2)',
              color: isGithub ? '#9ece6a' : isNews ? '#e0af68' : '#7aa2f7',
            }}>{item.source_type.toUpperCase()}</span>
            <span className="text-[11px] text-muted font-mono">{item.item_type}</span>
            {item.author && <span className="text-[11px] text-muted font-mono">{item.author}</span>}
          </div>
        </div>

        {/* Body: full info */}
        <div className="p-5 flex flex-col gap-5 max-h-[60vh] overflow-y-auto">
          {/* Chinese summary */}
          {item.summary && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u6458\u8981'}</div>
              <p className="text-[13px] text-fg-dim leading-relaxed">{item.summary}</p>
            </div>
          )}

          {/* Score radar chart */}
          {item.score_detail && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u5206\u6570\u96F7\u8FBE\u56FE'}</div>
              <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                <RadarChart d={item.score_detail} />
                <ScoreBars d={item.score_detail} />
              </div>
            </div>
          )}

          {/* Full metrics table */}
          <div>
            <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u8BE6\u7EC6\u6570\u636E'}</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">Stars</span>
                <span className="text-fg-dim font-mono">{fmtN(item.stars)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">Forks</span>
                <span className="text-fg-dim font-mono">{fmtN(item.forks)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">{'\u8BED\u8A00'}</span>
                <span className="text-fg-dim">{item.lang}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">{'\u72B6\u6001'}</span>
                <span className="text-fg-dim">{item.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">{'\u91C7\u96C6'}</span>
                <span className="text-fg-dim font-mono text-[10px]">{item.collected_at?.slice(0,19).replace('T',' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted font-mono text-[10px]">{'\u7FFB\u8BD1'}</span>
                <span className="text-fg-dim font-mono text-[10px]">{item.interpreted_at ? item.interpreted_at.slice(0,19).replace('T',' ') : '\u672A\u7FFB\u8BD1'}</span>
              </div>
            </div>
          </div>

          {/* Link */}
          {item.url && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u94FE\u63A5'}</div>
              <a href={item.url} target="_blank" rel="noreferrer" className="text-blue hover:underline text-xs font-mono break-all">{item.url}</a>
            </div>
          )}

          {/* Install command for GitHub */}
          {isGithub && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">{'\u5B89\u88C5\u547D\u4EE4'}</div>
              <pre className="bg-black/40 border border-border rounded-md px-3 py-2 text-xs font-mono text-green overflow-x-auto">codex skill install github:{item.source_id}</pre>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 p-5 pt-0 flex-wrap">
          {onFav && (
            <button
              className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg"
              style={item.is_favorited ? { background: '#9ece6a', color: '#16161e', border: 'none' } : {}}
              onClick={() => onFav(item.id)}
            >
              {item.is_favorited ? '\u2713 \u5DF2\u6536\u85CF' : '\u2606 \u6536\u85CF'}
            </button>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg">{'\u6253\u5F00\u94FE\u63A5'}</a>
          )}
          {isGithub && (
            <button className="px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br">{'\u5B89\u88C5\u5230 Codex'}</button>
          )}
        </div>
      </div>
    </div>
  );
}