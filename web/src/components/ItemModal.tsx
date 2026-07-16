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
        <div className="relative p-5 border-b border-border">
          <button className="absolute right-4 top-4 text-muted hover:text-fg text-xl leading-none" onClick={onClose}>x</button>
          <h2 className="text-base font-semibold text-fg pr-8">{item.title_zh ?? item.title}</h2>
          {item.title_zh && <div className="text-[11px] text-muted mt-0.5 font-mono">{item.title}</div>}
          {item.summary && <p className="text-[13px] text-amber mt-2 font-medium">{item.summary}</p>}
          <div className="font-mono text-2xl font-bold mt-2" style={{ color: scoreColor(item.score) }}>{item.score} 分</div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted font-mono">
            <span className="px-2 py-0.5 rounded text-[9px] font-bold" style={{
              background: isGithub ? 'rgba(158,206,106,.2)' : isNews ? 'rgba(224,175,104,.2)' : 'rgba(122,162,247,.2)',
              color: isGithub ? '#9ece6a' : isNews ? '#e0af68' : '#7aa2f7',
            }}>{item.source_type.toUpperCase()}</span>
            <span>{item.lang}</span>
            <span>{item.item_type}</span>
            {item.author && <span>{item.author}</span>}
          </div>
        </div>
        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {item.score_detail && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">分数雷达图</div>
              <div className="grid grid-cols-[180px_1fr] gap-4 items-center">
                <RadarChart d={item.score_detail} />
                <ScoreBars d={item.score_detail} />
              </div>
            </div>
          )}
          <div>
            <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">基本信息</div>
            <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <span className="text-muted font-mono text-[10px]">Stars</span>
              <span className="text-fg-dim">{fmtN(item.stars)}</span>
              <span className="text-muted font-mono text-[10px]">Forks</span>
              <span className="text-fg-dim">{fmtN(item.forks)}</span>
              <span className="text-muted font-mono text-[10px]">状态</span>
              <span className="text-fg-dim">{item.status}</span>
              <span className="text-muted font-mono text-[10px]">更新</span>
              <span className="text-fg-dim">{item.updated_at}</span>
            </div>
          </div>
          {item.url && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">链接</div>
              <a href={item.url} target="_blank" rel="noreferrer" className="text-blue hover:underline text-xs font-mono">{item.url}</a>
            </div>
          )}
          {isGithub && (
            <div>
              <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-2">安装命令</div>
              <pre className="bg-black/40 border border-border rounded-md px-3 py-2 text-xs font-mono text-green overflow-x-auto">codex skill install github:{item.source_id}</pre>
            </div>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-0 flex-wrap">
          {onFav && (
            <button
              className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg"
              style={item.is_favorited ? { background: '#9ece6a', color: '#16161e', border: 'none' } : {}}
              onClick={() => onFav(item.id)}
            >
              {item.is_favorited ? '已收藏' : '收藏'}
            </button>
          )}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt hover:text-fg">打开链接</a>
          )}
          {isGithub && (
            <button className="px-3.5 py-1.5 rounded-md text-xs bg-amber border border-amber text-bg font-semibold hover:bg-amber-br">安装到 Codex</button>
          )}
        </div>
      </div>
    </div>
  );
}