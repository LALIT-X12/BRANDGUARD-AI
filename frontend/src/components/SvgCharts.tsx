import { useState } from 'react';

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface DoughnutSegment {
  label: string;
  value: number;
  color: string;
}

export interface RadarAxis {
  axis: string;
  score: number;
}

export function IntegrityLineChart({ data }: { data: SeriesPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (!data.length) return null;

  const width = 540;
  const height = 210;
  const padX = 36;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const minVal = 60;
  const maxVal = 100;

  const points = data.map((d, idx) => {
    const x = padX + (data.length === 1 ? plotW / 2 : (idx / (data.length - 1)) * plotW);
    const ratio = Math.max(0, Math.min(1, (d.value - minVal) / (maxVal - minVal)));
    const y = padY + plotH - ratio * plotH;
    return { ...d, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Brand Integrity Over Time">
        <defs>
          <linearGradient id="bgIntegrityArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#86c9f5" stopOpacity="0.32" />
            <stop offset="55%" stopColor="#a5b4fc" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#86c9f5" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[60, 70, 80, 90, 100].map((tick) => {
          const y = padY + plotH - ((tick - minVal) / (maxVal - minVal)) * plotH;
          return (
            <g key={tick}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 4" />
              <text x={padX - 8} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="JetBrains Mono">
                {tick}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#bgIntegrityArea)" />
        <path d={linePath} fill="none" stroke="#86c9f5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, idx) => (
          <g key={p.label}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hovered === idx ? 6 : 4}
              fill={hovered === idx ? '#ffffff' : '#86c9f5'}
              stroke="rgba(8, 13, 24, 0.85)"
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
            />
            <text x={p.x} y={height - 6} textAnchor="middle" fill="#cbd5e1" fontSize="10" fontFamily="JetBrains Mono">
              {p.label}
            </text>
          </g>
        ))}
      </svg>

      {hovered !== null && points[hovered] && (
        <div
          className="liquid-glass-floating font-mono"
          style={{ position: 'absolute', top: '8px', right: '8px', padding: '6px 11px', fontSize: '0.75rem' }}
        >
          {points[hovered].label}: <strong style={{ color: 'var(--emerald)' }}>{points[hovered].value}%</strong>
        </div>
      )}
    </div>
  );
}

export function BrandHealthDoughnut({ segments }: { segments: DoughnutSegment[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg viewBox="0 0 180 180" style={{ width: '168px', height: '168px' }} role="img" aria-label="Brand Health Breakdown">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="18" />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circumference;
          const dashOffset = -offset;
          offset += dash;
          return (
            <circle
              key={seg.label}
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={active === i ? 22 : 18}
              strokeDasharray={`${dash} ${circumference}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 90 90)"
              style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease' }}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          );
        })}
        <text x="90" y="86" textAnchor="middle" fill="#f1f5f9" fontSize="22" fontWeight="700" fontFamily="JetBrains Mono">
          {active !== null ? segments[active].value : segments.reduce((s, x) => s + x.value, 0)}
        </text>
        <text x="90" y="104" textAnchor="middle" fill="#94a3b8" fontSize="10">
          {active !== null ? segments[active].label : 'Total'}
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px' }}>
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              opacity: active === null || active === i ? 1 : 0.55,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: seg.color }} />
              {seg.label}
            </span>
            <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComplianceRadarChart({ axes }: { axes: RadarAxis[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (!axes.length) return null;

  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 82;
  const count = axes.length;

  const polar = (idx: number, pct: number): [number, number] => {
    const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
    const r = (pct / 100) * maxR;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const polygonPoints = axes.map((a, i) => polar(i, a.score).join(',')).join(' ');

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '240px', height: '240px' }} role="img" aria-label="Six-Dimensional Compliance Radar">
        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => polar(i, ring).join(',')).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.11)"
          />
        ))}
        {axes.map((a, i) => {
          const [x2, y2] = polar(i, 100);
          const [lx, ly] = polar(i, 120);
          return (
            <g key={a.axis}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.11)" />
              <text x={lx} y={ly + 3} textAnchor="middle" fill="#cbd5e1" fontSize="10">
                {a.axis}
              </text>
            </g>
          );
        })}
        <polygon points={polygonPoints} fill="rgba(134, 201, 245, 0.2)" stroke="#86c9f5" strokeWidth="2" />
        {axes.map((a, i) => {
          const [px, py] = polar(i, a.score);
          return (
            <circle
              key={a.axis}
              cx={px}
              cy={py}
              r={hovered === i ? 5 : 3.5}
              fill={hovered === i ? '#ffffff' : '#a5b4fc'}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {hovered !== null && axes[hovered] && (
        <div
          className="liquid-glass-floating font-mono"
          style={{ position: 'absolute', top: 0, right: 0, padding: '6px 10px', fontSize: '0.74rem' }}
        >
          {axes[hovered].axis}: <strong style={{ color: 'var(--sky)' }}>{axes[hovered].score}%</strong>
        </div>
      )}
    </div>
  );
}

export function ChannelHeatmap({ rows }: { rows: Array<{ channel: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count || 0));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '10px' }}>
      {rows.map((row) => {
        const intensity = Math.min(1, (row.count || 0) / max);
        const bg =
          intensity > 0.7
            ? 'linear-gradient(155deg, rgba(251, 113, 133, 0.22), rgba(255, 255, 255, 0.05))'
            : intensity > 0.35
              ? 'linear-gradient(155deg, rgba(251, 191, 36, 0.18), rgba(255, 255, 255, 0.05))'
              : 'linear-gradient(155deg, rgba(134, 201, 245, 0.16), rgba(255, 255, 255, 0.05))';
        const border =
          intensity > 0.7
            ? 'rgba(251, 113, 133, 0.42)'
            : intensity > 0.35
              ? 'rgba(251, 191, 36, 0.38)'
              : 'rgba(134, 201, 245, 0.32)';
        return (
          <div
            key={row.channel}
            style={{
              padding: '14px',
              borderRadius: '14px',
              background: bg,
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              {row.channel}
            </div>
            <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '4px' }}>
              {row.count}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>flagged discrepancies</div>
          </div>
        );
      })}
    </div>
  );
}
