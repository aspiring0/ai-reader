import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Item } from '@shared/types';

export function AdminPage() {
  const qc = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ['admin-stats'], queryFn: api.admin.stats });
  const { data: itemsData, isLoading } = useQuery({ queryKey: ['admin-items'], queryFn: () => api.admin.items(1, 200) });
  const [editing, setEditing] = useState<Item | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const delMut = useMutation({
    mutationFn: (id: string) => api.admin.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-items'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.admin.update(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-items'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });
  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.admin.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-items'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); qc.invalidateQueries({ queryKey: ['feed'] }); },
  });

  const items = itemsData?.items ?? [];

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          ['总数', stats?.total ?? 0],
          ['已评分', stats?.scored ?? 0],
          ['已隐藏', stats?.hidden ?? 0],
          ['已收藏', stats?.favorited ?? 0],
        ].map(([label, val]) => (
          <div key={label as string} className="bg-surface border border-border rounded-md p-2.5">
            <div className="text-[10px] text-muted">{label}</div>
            <div className="font-mono text-lg text-fg font-semibold">{val}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] text-muted uppercase tracking-wide">数据管理 ({items.length} 条)</div>
        <button className="px-3 py-1.5 rounded-md bg-amber text-bg text-xs font-semibold hover:bg-amber-br" onClick={() => setShowCreate(true)}>+ 手动添加</button>
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="text-center py-6 text-muted text-xs">加载中...</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted font-mono text-[10px] text-left border-b border-border">
                <th className="py-1.5 pr-3">来源</th>
                <th className="py-1.5 pr-3">标题</th>
                <th className="py-1.5 pr-3">类型</th>
                <th className="py-1.5 pr-3">分数</th>
                <th className="py-1.5 pr-3">状态</th>
                <th className="py-1.5 pr-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-border/50 hover:bg-surface/50">
                  <td className="py-1.5 pr-3 text-muted font-mono text-[10px]">{it.source_type}</td>
                  <td className="py-1.5 pr-3 text-fg-dim max-w-xs truncate">{it.title}</td>
                  <td className="py-1.5 pr-3 text-muted">{it.item_type}</td>
                  <td className="py-1.5 pr-3 font-mono text-fg-dim">{it.score}</td>
                  <td className="py-1.5 pr-3">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{
                      background: it.status === 'scored' ? 'rgba(158,206,106,.15)' : 'rgba(247,118,142,.15)',
                      color: it.status === 'scored' ? '#9ece6a' : '#f7768e',
                    }}>{it.status}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <button className="text-blue hover:underline mr-2 text-[11px]" onClick={() => setEditing(it)}>编辑</button>
                    <button className="text-coral hover:underline text-[11px]" onClick={() => { if (confirm('确认删除?')) delMut.mutate(it.id); }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* edit modal */}
      {editing && <EditModal item={editing} onClose={() => setEditing(null)} onSave={(body) => { updateMut.mutate({ id: editing.id, body }); setEditing(null); }} />}

      {/* create modal */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={(body) => { createMut.mutate(body); setShowCreate(false); }} />}
    </div>
  );
}

function EditModal({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary ?? '');
  const [score, setScore] = useState(item.score);
  const [status, setStatus] = useState<string>(item.status);
  const [itemType, setItemType] = useState<string>(item.item_type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border-lt bg-bg p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-fg">编辑: {item.source_id}</h3>
        <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">标题</span><input className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">摘要 / Tag</span><textarea className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" rows={2} value={summary} onChange={e => setSummary(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">分数</span><input type="number" className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" value={score} onChange={e => setScore(Number(e.target.value))} /></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">状态</span><select className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-fg outline-none" value={status} onChange={e => setStatus(e.target.value)}><option value="scored">scored</option><option value="hidden">hidden</option></select></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">类型</span><select className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-fg outline-none" value={itemType} onChange={e => setItemType(e.target.value)}><option value="project">project</option><option value="skill">skill</option><option value="agent">agent</option><option value="news">news</option></select></label>
        </div>
        <div className="flex gap-2 mt-1">
          <button className="px-3.5 py-1.5 rounded-md text-xs bg-amber text-bg font-semibold hover:bg-amber-br" onClick={() => onSave({ title, summary: summary || null, score, status, item_type: itemType })}>保存</button>
          <button className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [sourceType, setSourceType] = useState('github');
  const [itemType, setItemType] = useState('project');
  const [score, setScore] = useState(50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border-lt bg-bg p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-fg">手动添加条目</h3>
        <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">标题 *</span><input className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">URL *</span><input className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" value={url} onChange={e => setUrl(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">摘要 / Tag</span><textarea className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" rows={2} value={summary} onChange={e => setSummary(e.target.value)} /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">来源</span><select className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-fg outline-none" value={sourceType} onChange={e => setSourceType(e.target.value)}><option value="github">github</option><option value="rss">rss</option><option value="hackernews">hn</option></select></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">类型</span><select className="bg-surface border border-border rounded px-2 py-1.5 text-xs text-fg outline-none" value={itemType} onChange={e => setItemType(e.target.value)}><option value="project">project</option><option value="skill">skill</option><option value="agent">agent</option><option value="news">news</option></select></label>
          <label className="flex flex-col gap-1"><span className="text-[10px] text-muted font-mono">分数</span><input type="number" className="bg-surface border border-border rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-amber" value={score} onChange={e => setScore(Number(e.target.value))} /></label>
        </div>
        <div className="flex gap-2 mt-1">
          <button className="px-3.5 py-1.5 rounded-md text-xs bg-amber text-bg font-semibold hover:bg-amber-br disabled:opacity-50" disabled={!title || !url} onClick={() => onCreate({ title, url, summary: summary || undefined, source_type: sourceType, item_type: itemType, score })}>创建</button>
          <button className="px-3.5 py-1.5 rounded-md text-xs border border-border text-fg-dim hover:border-border-lt" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}