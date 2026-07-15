import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import { FeedPage } from './pages/FeedPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemPage } from './pages/SystemPage';
import { AdminPage } from './pages/AdminPage';

type Page = 'skill' | 'news' | 'fav' | 'settings' | 'system' | 'admin';

const NAV: { key: Page; label: string }[] = [
  { key: 'skill', label: '技能 & 项目' },
  { key: 'news', label: 'AI 热点' },
  { key: 'fav', label: '收藏' },
  { key: 'settings', label: '设置' },
  { key: 'system', label: '系统' },
  { key: 'admin', label: '管理' },
];

export default function App() {
  const [page, setPage] = useState<Page>('skill');
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30_000 });

  return (
    <div className="min-h-screen flex flex-col">
      {/* nav */}
      <nav className="flex items-center gap-3 px-4 h-11 bg-surface border-b border-border">
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

      {/* content */}
      <div className="flex-1">
        {page === 'skill' && <FeedPage mode="skill" />}
        {page === 'news' && <FeedPage mode="news" />}
        {page === 'fav' && <FeedPage mode="fav" />}
        {page === 'settings' && <SettingsPage />}
        {page === 'system' && <SystemPage />}
        {page === 'admin' && <AdminPage />}
      </div>

      {/* status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-surface border-t border-border font-mono text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green" style={{ boxShadow: '0 0 6px #9ece6a' }} />
          在线
        </span>
        <span>{health?.db_items ?? '--'} 条数据</span>
        {health?.last_collect && <span>上次同步 {health.last_collect.slice(11, 19)}</span>}
        <span className="ml-auto">127.0.0.1:3001</span>
      </div>
    </div>
  );
}