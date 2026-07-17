import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

type DailyScore = { date: string; count: number };
type SourceItem = { source: string; count: number };
type ScoreBucket = { bucket: string; count: number };
type Topic = { topic: string; count: number };

const MUTED = '#6b7394';
const AMBER = '#e0af68';
const GREEN = '#9ece6a';
const BLUE = '#7aa2f7';
const GRID = '#242938';
const FG_DIM = '#b8c2d8';
const TOPIC_COLORS = ['#7aa2f7', '#bb9af7', '#7dcfff', '#9ece6a', '#e0af68'];

const T_DAILY = '\u65E5\u65B0\u589E\u9879\u76EE\u8D8B\u52BF (30 days)';
const T_SOURCE = '\u6570\u636E\u6765\u6E90\u5206\u5E03';
const T_SCORE = '\u5206\u6570\u5206\u5E03';
const T_TOPICS = '\u70ED\u95E8\u8BDD\u9898';
const LOADING = '\u52A0\u8F7D\u4E2D...';
const EMPTY = '\u6682\u65E0\u6570\u636E';

const SOURCE_ORDER = ['github', 'hackernews', 'rss'];
const SOURCE_COLORS: Record<string, string> = { github: GREEN, hackernews: AMBER, rss: BLUE };
const BUCKETS = ['0-19', '20-39', '40-59', '60-79', '80-100'];

// Linear interpolation between two #rrggbb colors (t in [0,1]).
function lerpColor(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

function Card({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={'rounded-lg border border-border bg-surface p-4 ' + (className ?? '')}>
      <div className="font-mono text-[10px] text-muted uppercase tracking-wide mb-3">{title}</div>
      {children}
    </div>
  );
}

function EmptyBox({ w, h }: { w: number; h: number }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <text x={w / 2} y={h / 2} textAnchor="middle" fill={MUTED} fontSize={11}>{EMPTY}</text>
    </svg>
  );
}

function DailyTrendChart({ data }: { data: DailyScore[] }) {
  const W = 600, H = 200;
  const padL = 34, padR = 14, padT = 14, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseline = padT + plotH;
  const n = data.length;

  if (n === 0) return <EmptyBox w={W} h={H} />;

  const maxCount = Math.max(1, ...data.map(d => d.count));
  const xs = data.map((_, i) => padL + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2));
  const ys = data.map(d => padT + plotH - (d.count / maxCount) * plotH);

  const linePts = xs.map((x, i) => x.toFixed(1) + ',' + ys[i].toFixed(1)).join(' ');
  const segs = xs.map((x, i) => 'L ' + x.toFixed(1) + ' ' + ys[i].toFixed(1));
  const areaPath = `M ${xs[0].toFixed(1)} ${baseline} ${segs.join(' ')} L ${xs[n - 1].toFixed(1)} ${baseline} Z`;
  const ticks = [1, 0.5, 0];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="daily trend">
      {ticks.map(f => {
        const y = padT + plotH - f * plotH;
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={GRID} strokeWidth={0.5} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fill={MUTED} fontSize={10}>{Math.round(maxCount * f)}</text>
          </g>
        );
      })}
      {n > 1 && <path d={areaPath} fill={AMBER} fillOpacity={0.12} stroke="none" />}
      {n > 1 && <polyline points={linePts} fill="none" stroke={AMBER} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />}
      {xs.map((x, i) => (
        <g key={i}>
          <circle cx={x.toFixed(1)} cy={ys[i].toFixed(1)} r={2.2} fill={AMBER} />
          {i % 5 === 0 && (
            <text x={x.toFixed(1)} y={baseline + 14} textAnchor="middle" fill={MUTED} fontSize={10}>{data[i].date.slice(5)}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

function SourceDistributionChart({ data }: { data: SourceItem[] }) {
  const map = new Map(data.map(d => [d.source, d.count]));
  const rows = SOURCE_ORDER.map(s => ({ source: s, count: map.get(s) ?? 0 }));
  const maxCount = Math.max(1, ...rows.map(r => r.count));

  const W = 320, labelX = 4, barX = 86, barMax = 158, countX = 252;
  const rowH = 40, top = 12;
  const H = top + rows.length * rowH + 8;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="source distribution">
      {rows.map((r, i) => {
        const y = top + i * rowH;
        const cy = y + rowH / 2;
        const w = (r.count / maxCount) * barMax;
        const color = SOURCE_COLORS[r.source] ?? BLUE;
        return (
          <g key={r.source}>
            <text x={labelX} y={cy + 3} fill={MUTED} fontSize={11}>{r.source}</text>
            <rect x={barX} y={cy - 7} width={Math.max(w, r.count > 0 ? 2 : 0)} height={14} rx={3} fill={color} />
            <text x={countX} y={cy + 3} fill={FG_DIM} fontSize={11} fontWeight={600}>{r.count}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ScoreDistributionChart({ data }: { data: ScoreBucket[] }) {
  const map = new Map(data.map(d => [d.bucket, d.count]));
  const counts = BUCKETS.map(b => map.get(b) ?? 0);
  const maxCount = Math.max(1, ...counts);

  const W = 320, H = 190;
  const padL = 16, padR = 16, padT = 14, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / BUCKETS.length;
  const barW = slot * 0.6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="score distribution">
      {counts.map((c, i) => {
        const x = padL + i * slot + (slot - barW) / 2;
        const bh = (c / maxCount) * plotH;
        const y = padT + plotH - bh;
        const color = lerpColor(MUTED, AMBER, i / (BUCKETS.length - 1));
        return (
          <g key={BUCKETS[i]}>
            <rect x={x.toFixed(1)} y={y.toFixed(1)} width={barW.toFixed(1)} height={Math.max(bh, c > 0 ? 2 : 0)} rx={3} fill={color} />
            <text x={(x + barW / 2).toFixed(1)} y={(padT + plotH + 14).toFixed(1)} textAnchor="middle" fill={MUTED} fontSize={10}>{BUCKETS[i]}</text>
            {c > 0 && <text x={(x + barW / 2).toFixed(1)} y={(y - 4).toFixed(1)} textAnchor="middle" fill={FG_DIM} fontSize={10}>{c}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function TopTopics({ data }: { data: Topic[] }) {
  if (data.length === 0) {
    return <div className="py-6 text-center text-xs" style={{ color: MUTED }}>{EMPTY}</div>;
  }
  const counts = data.map(t => t.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const sizeFor = (c: number) => max === min ? 14 : 10 + Math.round(((c - min) / (max - min)) * 8);
  return (
    <div className="flex flex-wrap gap-2">
      {data.map((t, i) => {
        const color = TOPIC_COLORS[i % TOPIC_COLORS.length];
        return (
          <button key={t.topic} type="button" title={t.topic + ' (' + t.count + ')'}
            className="px-2.5 py-1 rounded-full border transition-colors hover:bg-surface2"
            style={{ fontSize: sizeFor(t.count), color, borderColor: color + '55' }}>
            {t.topic}
            <span className="ml-1 font-mono text-[10px] opacity-60">{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TrendsPage() {
const { data, isLoading } = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 120_000 });
  const daily = data?.daily_scores ?? [];
  const sources = data?.source_distribution ?? [];
  const scores = data?.score_distribution ?? [];
  const topics = data?.top_topics ?? [];

  if (isLoading) {
    return (
      <div className="p-4 max-w-4xl">
        <div className="py-16 text-center text-xs" style={{ color: MUTED }}>{LOADING}</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={T_DAILY} className="md:col-span-2">
          <DailyTrendChart data={daily} />
        </Card>
        <Card title={T_SOURCE}>
          <SourceDistributionChart data={sources} />
        </Card>
        <Card title={T_SCORE}>
          <ScoreDistributionChart data={scores} />
        </Card>
        <Card title={T_TOPICS} className="md:col-span-2">
          <TopTopics data={topics} />
        </Card>
      </div>
    </div>
  );
}
