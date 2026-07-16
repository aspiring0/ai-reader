import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Item } from '@shared/types';
import { ItemModal } from '../components/ItemModal';

function scoreColor(s: number): string {
  if (s >= 85) return '#e0af68'; if (s >= 70) return '#c9a253'; if (s >= 50) return '#94784a'; return '#5e5236';
}
function fmtN(n: number): string {
  if (!n) return '--'; if (n >= 1000) return (n / 1000).toFixed(1) + 'k'; return String(n);
}

function Card({ item, onClick }: { item: Item; onClick: () => void }) {
  const isGithub = item.source_type === 'github';
  const isNews = item.source_type === 'rss' || item.source_type === 'hackernews';
  const typeColor = isGithub ? '#9ece6a' : isNews ? '#e0af68' : '#7aa2f7';
  const typeBg = isGithub ? 'rgba(158,206,106,.2)' : isNews ? 'rgba(224,175,104,.2)' : 'rgba(122,162,247,.2)';
  const title = item.title_zh ?? item.title;

  return (
    <div className="relative rounded-lg border border-border bg-surface p-3 cursor-pointer hover:border-border-lt transition-all" onClick={onClick}>
      <div className="absolute top-0 right-0 px-2 py-0.5 text-[9px] font-mono font-bold rounded-bl-lg rounded-tr-lg" style={{ background: typeBg, color: typeColor }}>
        {item.source_type.toUpperCase()}
      </div>
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="text-[13px] font-medium text-fg leading-snug pr-8 line-clamp-2">{title}</div>
        <div className="font-mono text-lg font-bold flex-shrink-0" style={{ color: scoreColor(item.score) }}>{item.score}</div>
      </div>
      {item.summary && (
        <div className="text-[11px] text-amber/80 leading-snug line-clamp-1 mb-1.5">{item.summary}</div>
      )}
      <div className="flex gap-2.5 text-[10px] text-muted font-mono">
        {isGithub && <span>{fmtN(item.stars)} star</span>}
        <span>{item.updated_at?.slice(0, 10)}</span>
      </div>
    </div>
  );
}

export function FeedPage({ mode }: { mode: 'skill' | 'news' | 'fav' }) {
  const tab = mode;
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('score');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const feedParams = {
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    type: tab === 'skill' && typeFilter !== 'all' ? typeFilter : undefined,
    sort,
    q: search || undefined,
    limit: 100,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['feed', feedParams],
    queryFn: () => api.feed(feedParams),
  });

  const favMutation = useMutation({
    mutationFn: (id: string) => api.admin.update(id, { is_favorited: 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['item'] }); },
  });

  const { data: selectedItem } = useQuery({
    queryKey: ['item', selectedId],
    queryFn: () => api.item(selectedId!),
    enabled: !!selectedId,
  });

  const items = data?.items ?? [];
  const favItems = items.filter(i => i.is_favorited);

  const showItems = tab === 'fav' ? favItems : items;

  return (
    <div>
      <div className="flex items-center gap-2.5 px-3.5 py-2 border-b border-border flex-wrap">
        <input
          className="flex-1 min-w-[120px] bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber"
          placeholder={tab === 'skill' ? '搜索技能、项目、关键词...' : '搜索新闻...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-px bg-surface border border-border rounded-md p-0.5">
          {(tab === 'skill'
            ? [['all', '全部'], ['github', 'GitHub'], ['hackernews', 'HN'], ['rss', 'RSS']]
            : tab === 'news'
            ? [['all', '全部'], ['rss', 'RSS'], ['hackernews', 'HN']]
            : [['all', '全部']]
          ).map(([val, label]) => (
            <button key={val} onClick={() => setSourceFilter(val)}
              className={'font-mono text-[11px] px-2.5 py-1 rounded ' + (sourceFilter === val ? 'bg-amber text-bg' : 'text-muted hover:text-fg-dim')}
            >{label}</button>
          ))}
        </div>
        {tab === 'skill' && (
          <div className="flex gap-px bg-surface border border-border rounded-md p-0.5">
            {[['all', '全部'], ['project', '项目'], ['skill', 'Skill'], ['agent', 'Agent']].map(([val, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)}
                className={'font-mono text-[11px] px-2.5 py-1 rounded ' + (typeFilter === val ? 'bg-amber text-bg' : 'text-muted hover:text-fg-dim')}
              >{label}</button>
            ))}
          </div>
        )}
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="bg-surface border border-border rounded-md px-2 py-1 text-[11px] text-fg-dim outline-none">
          <option value="score">按分数</option>
          <option value="hot">按 Star</option>
          <option value="recent">按时间</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted text-xs">加载中...</div>
      ) : showItems.length === 0 ? (
        <div className="text-center py-10 text-muted text-xs">{tab === 'fav' ? '还没有收藏' : '没有匹配的结果'}</div>
      ) : (
        <div className="grid gap-2.5 p-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {showItems.map(item => (
            <Card key={item.id} item={item} onClick={() => setSelectedId(item.id)} />
          ))}
        </div>
      )}

      {selectedItem && (
        <ItemModal
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onFav={(id) => { favMutation.mutate(id); }}
        />
      )}
    </div>
  );
}
