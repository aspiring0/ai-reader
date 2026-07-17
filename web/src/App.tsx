import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import { FeedPage } from './pages/FeedPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemPage } from './pages/SystemPage';
import { AdminPage } from './pages/AdminPage';
import { TrendsPage } from './pages/TrendsPage';

type Page = 'skill' | 'news' | 'fav' | 'trends' | 'settings' | 'system' | 'admin';

const NAV: { key: Page; label: string }[] = [
  { key: 'skill', label: '\u6280\u80FD & \u9879\u76EE' },
  { key: 'news', label: 'AI \u70ED\u70B9' },
  { key: 'fav', label: '\u6536\u85CF' },
  { key: 'trends', label: '\u8D8B\u52BF' },
  { key: 'settings', label: '\u8BBE\u7F6E' },
  { key: 'system', label: '\u7CFB\u7EDF' },
  { key: 'admin', label: '\u7BA1\u7406' },
];

export default function App() {
  const [page, setPage] = useState<Page>('skill');
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000 });

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 flex items-center gap-3 px-4 h-11 bg-surface/95 backdrop-blur border-b border-border">
        <div className="font-semibold text-[13px] text-amber flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green" style={{ boxShadow: '0 0 6px #9ece6a' }} />
          AI RADAR
        </div>
        <div className="flex gap-0.5 ml-2">
          {NAV.map(n => (
            <button
              key={n.key}
              onClick={() => setPage(n.key)}
              className={'text-xs px-3.5 py-1.5 rounded-md transition-colors ' + (page === n.key ? 'text-fg bg-surface2' : 'text-muted hover:text-fg-dim')}
              style={page === n.key ? { position: 'relative' } : {}}
            >
              {n.label}
              {page === n.key && <span className="absolute left-3.5 right-3.5 bottom-[-4px] h-0.5 bg-amber rounded-full" />}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1">
        <div style={{ display: page === 'skill' ? 'block' : 'none' }}><FeedPage mode="skill" /></div>
        <div style={{ display: page === 'news' ? 'block' : 'none' }}><FeedPage mode="news" /></div>
        <div style={{ display: page === 'fav' ? 'block' : 'none' }}><FeedPage mode="fav" /></div>
        {page === 'trends' && <TrendsPage />}
        {page === 'settings' && <SettingsPage />}
        {page === 'system' && <SystemPage />}
        {page === 'admin' && <AdminPage />}
      </div>

      <div className="flex items-center gap-4 px-4 py-1.5 bg-surface border-t border-border font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green" style={{ boxShadow: '0 0 6px #9ece6a' }} />
          {'\u5728\u7EBF'}
        </span>
        <span>{health?.db_items ?? '--'} {'\u6761\u6570\u636E'}</span>
        {health?.last_collect && <span>{'\u4E0A\u6B21\u540C\u6B65'} {health.last_collect.slice(11, 19)}</span>}
        <span className="ml-auto">127.0.0.1:3001</span>
      </div>
    </div>
  );
}
