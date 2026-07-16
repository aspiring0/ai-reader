import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Item } from '@shared/types';
import { ItemModal } from '../components/ItemModal';
import { getGithubMeta } from '../lib/rawData';

const PAGE_SIZE = 12;

function fmtN(n: number): string {
  if (!n) return '--';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function scoreColor(s: number): string {
  if (s >= 85) return '#e0af68';
  if (s >= 70) return '#c9a253';
  if (s >= 50) return '#94784a';
  return '#5e5236';
}

/** Tag palette: rotate accent colors for topic tags. */
const TAG_COLORS = [
  { bg: 'rgba(122,162,247,.15)', fg: '#7aa2f7' },
  { bg: 'rgba(187,154,247,.15)', fg: '#bb9af7' },
  { bg: 'rgba(125,207,255,.15)', fg: '#7dcfff' },
  { bg: 'rgba(158,206,106,.15)', fg: '#9ece6a' },
];

function Card({ item, onClick }: { item: Item; onClick: () => void }) {
  const isGithub = item.source_type === 'github';
  const isNews = item.source_type === 'rss' || item.source_type === 'hackernews';

  // Extract GitHub metadata in one pass
  const ghMeta = useMemo(() => isGithub ? getGithubMeta(item.raw_data) : null, [item.raw_data, isGithub]);
  const topics = ghMeta?.topics?.slice(0, 3) ?? [];
  const ghDescription = ghMeta?.description ?? null;
  const ghLanguage = ghMeta?.language ?? null;

  const title = item.title_zh ?? item.title;
  const dateStr = (item.pushed_at ?? item.updated_at)?.slice(0, 10);

  return (
    <div
      className="group relative rounded-lg border border-border bg-surface p-3.5 cursor-pointer transition-all hover:border-border-lt hover:bg-surface2"
      onClick={onClick}
    >
      {/* Top row: tags + score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {topics.length > 0 ? (
            topics.map((t, i) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-medium"
                style={{ background: TAG_COLORS[i % TAG_COLORS.length].bg, color: TAG_COLORS[i % TAG_COLORS.length].fg }}
              >
                {t}
              </span>
            ))
          ) : (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold"
              style={{
                background: isGithub ? 'rgba(158,206,106,.15)' : isNews ? 'rgba(224,175,104,.15)' : 'rgba(122,162,247,.15)',
                color: isGithub ? '#9ece6a' : isNews ? '#e0af68' : '#7aa2f7',
              }}
            >
              {item.source_type.toUpperCase()}
            </span>
          )}
        </div>
        {/* Score badge: skills only */}
        {isGithub && (
          <span className="font-mono text-lg font-bold leading-none flex-shrink-0" style={{ color: scoreColor(item.score) }}>
            {item.score}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="text-[13px] font-medium text-fg leading-snug line-clamp-2 mb-1.5">{title}</div>

      {/* Description: Chinese summary + English description for GitHub, summary for news */}
      <div className="mb-2">
        {item.summary && (
          <div className="text-[11px] text-fg-dim leading-relaxed line-clamp-4">{item.summary}</div>
        )}
        {isGithub && ghDescription && ghDescription !== item.summary && (
          <div className="text-[10px] text-muted leading-relaxed line-clamp-1 mt-0.5 italic">{ghDescription}</div>
        )}
      </div>

      {/* Bottom stats */}
      <div className="flex items-center gap-3 text-[10px] text-muted font-mono">
        {isGithub && <span className="flex items-center gap-0.5"><span style={{ color: '#e0af68' }}>{'\u2605'}</span> {fmtN(item.stars)}</span>}
        {isGithub && ghLanguage && <span>{ghLanguage}</span>}
        {isNews && item.source_type === 'hackernews' && <span>{fmtN(item.stars)} {'\u5206'}</span>}
        {dateStr && <span>{dateStr}</span>}
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const pages: (number | string)[] = [];
  const add = (p: number | string) => pages.push(p);

  if (page > 1) add(1);
  if (page > 3) add('...');
  for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) add(p);
  if (page < totalPages - 2) add('...');
  if (page < totalPages) add(totalPages);

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button
        className="px-2.5 py-1 rounded text-xs text-muted hover:text-fg hover:bg-surface2 disabled:opacity-30"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >{'\u2039'}</button>
      {pages.map((p, i) =>
        typeof p === 'number' ? (
          <button
            key={i}
            className={'w-7 h-7 rounded text-xs font-mono ' + (p === page ? 'bg-amber text-bg font-bold' : 'text-muted hover:text-fg hover:bg-surface2')}
            onClick={() => onPage(p)}
          >{p}</button>
        ) : (
          <span key={i} className="px-1 text-muted text-xs">{p}</span>
        )
      )}
      <button
        className="px-2.5 py-1 rounded text-xs text-muted hover:text-fg hover:bg-surface2 disabled:opacity-30"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >{'\u203A'}</button>
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
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const feedParams = {
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    type: tab === 'skill' && typeFilter !== 'all' ? typeFilter : undefined,
    sort,
    q: search || undefined,
    limit: 200,
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

  const allItems = data?.items ?? [];
  const favItems = allItems.filter(i => i.is_favorited);

  // For news mode, default sort to recent
  const effectiveSort = tab === 'news' && sort === 'score' ? 'recent' : sort;

 const filteredItems = tab === 'fav' ? favItems : allItems;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const showItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  React.useEffect(() => { setPage(1); }, [tab, sourceFilter, typeFilter, effectiveSort, search]);

  return (
    <div>
      {/* Sticky filter bar */}
      <div className="sticky top-11 z-40 flex items-center gap-2.5 px-3.5 py-2 bg-bg/95 backdrop-blur border-b border-border flex-wrap">
        <input
          className="flex-1 min-w-[120px] bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-fg outline-none focus:border-amber"
          placeholder={tab === 'skill'
            ? '\u641C\u7D22\u6280\u80FD\u3001\u9879\u76EE\u3001\u5173\u952E\u8BCD...'
            : tab === 'news'
            ? '\u641C\u7D22\u65B0\u95FB...'
            : '\u641C\u7D22\u6536\u85CF...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-px bg-surface border border-border rounded-md p-0.5">
          {(tab === 'skill'
            ? [['all', '\u5168\u90E8'], ['github', 'GitHub'], ['hackernews', 'HN'], ['rss', 'RSS']]
            : tab === 'news'
            ? [['all', '\u5168\u90E8'], ['rss', 'RSS'], ['hackernews', 'HN']]
            : [['all', '\u5168\u90E8']]
          ).map(([val, label]) => (
            <button key={val} onClick={() => setSourceFilter(val)}
              className={'font-mono text-[11px] px-2.5 py-1 rounded ' + (sourceFilter === val ? 'bg-amber text-bg' : 'text-muted hover:text-fg-dim')}
            >{label}</button>
          ))}
        </div>
        {tab === 'skill' && (
          <div className="flex gap-px bg-surface border border-border rounded-md p-0.5">
            {[['all', '\u5168\u90E8'], ['project', '\u9879\u76EE'], ['skill', 'Skill'], ['agent', 'Agent']].map(([val, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)}
                className={'font-mono text-[11px] px-2.5 py-1 rounded ' + (typeFilter === val ? 'bg-amber text-bg' : 'text-muted hover:text-fg-dim')}
              >{label}</button>
            ))}
          </div>
        )}
        <select value={effectiveSort} onChange={e => setSort(e.target.value)}
          className="bg-surface border border-border rounded-md px-2 py-1 text-[11px] text-fg-dim outline-none">
          <option value="score">{'\u6309\u5206\u6570'}</option>
          <option value="hot">{'\u6309 Star'}</option>
          <option value="recent">{'\u6309\u65F6\u95F4'}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted text-xs">{'\u52A0\u8F7D\u4E2D'}...</div>
      ) : showItems.length === 0 ? (
        <div className="text-center py-20 text-muted text-xs">
          {tab === 'fav' ? '\u8FD8\u6CA1\u6709\u6536\u85CF' : '\u6CA1\u6709\u5339\u914D\u7684\u7ED3\u679C'}
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 p-3.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {showItems.map(item => (
              <Card key={item.id} item={item} onClick={() => setSelectedId(item.id)} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </>
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
