import type { ScoreDetail } from '@shared/types';

const LABELS = ['增速', '活跃', 'Fork', 'Issue', '作者'] as const;
const ANGLES = [0, 72, 144, 216, 288];

function pt(cx: number, cy: number, r: number, angleDeg: number, value: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [cx + r * value * Math.sin(rad), cy - r * value * Math.cos(rad)];
}

function colorFor(v: number): string {
  if (v >= 0.75) return '#9ece6a';
  if (v >= 0.5) return '#e0af68';
  if (v >= 0.25) return '#e4b86d';
  return '#f7768e';
}

export function RadarChart({ d, size = 180 }: { d: ScoreDetail; size?: number }) {
  const cx = 90, cy = 90, r = 65;
  const keys: (keyof ScoreDetail)[] = ['star_velocity', 'activity', 'fork_ratio', 'issue_health', 'author_reputation'];
  const values = keys.map(k => d[k]);

  return (
    <svg viewBox="0 0 180 180" width={size} height={size} role="img" aria-label="分数雷达图">
      {/* grid rings */}
      {[1/3, 2/3, 1].map((lv, i) => {
        const pts = ANGLES.map(a => { const [x, y] = pt(cx, cy, r, a, lv); return x.toFixed(1) + ',' + y.toFixed(1); }).join(' ');
        return <polygon key={i} points={pts} fill="none" stroke="#3a3d52" strokeWidth={0.5} />;
      })}
      {/* axes */}
      {ANGLES.map(a => {
        const [x, y] = pt(cx, cy, r, a, 1);
        return <line key={a} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="#3a3d52" strokeWidth={0.5} />;
      })}
      {/* data polygon */}
      <polygon
        points={ANGLES.map((a, i) => { const [x, y] = pt(cx, cy, r, a, values[i]); return x.toFixed(1) + ',' + y.toFixed(1); }).join(' ')}
        fill="#e0af68" fillOpacity={0.2} stroke="#e0af68" strokeWidth={1.5}
      />
      {/* data dots + labels */}
      {ANGLES.map((a, i) => {
        const [x, y] = pt(cx, cy, r, a, values[i]);
        const [lx, ly] = pt(cx, cy, r, a, 1.22);
        const sn = Math.sin((a * Math.PI) / 180);
        const anchor = Math.abs(sn) < 0.3 ? 'middle' : sn > 0 ? 'start' : 'end';
        return (
          <g key={a}>
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill="#e0af68" />
            <text x={lx.toFixed(1)} y={(ly + 3).toFixed(1)} textAnchor={anchor} fill="#6b7394" fontSize={9} fontFamily="system-ui">{LABELS[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function ScoreBars({ d }: { d: ScoreDetail }) {
  const labels = ['Star 增速', '维护活跃', 'Fork 比', 'Issue 健康', '作者信誉'] as const;
  const keys: (keyof ScoreDetail)[] = ['star_velocity', 'activity', 'fork_ratio', 'issue_health', 'author_reputation'];
  return (
    <div className="flex flex-col gap-1.5">
      {keys.map((k, i) => (
        <div key={k} className="grid grid-cols-[90px_1fr_30px] items-center gap-2">
          <span className="font-mono text-[9px] text-muted">{labels[i]}</span>
          <div className="h-1 bg-surface2 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: Math.round(d[k] * 100) + '%', background: colorFor(d[k]) }} />
          </div>
          <span className="font-mono text-[10px] text-fg-dim text-right">{d[k].toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}