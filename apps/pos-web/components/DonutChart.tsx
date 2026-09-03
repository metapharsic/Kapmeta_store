import React, { useMemo, useState } from "react";

/**
 * One slice of the donut. `value` must be >= 0.
 */
export interface DonutSlice {
  label: string;
  value: number;
  /** CSS color for this slice. Falls back to a palette if omitted. */
  color?: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  /** Outer diameter in px. Default 160. */
  size?: number;
  /** Ring thickness in px. Default 26. */
  thickness?: number;
  loading?: boolean;
  emptyMessage?: string;
  /** Formats the tooltip / legend value. Default: raw integer count. */
  valueFormatter?: (value: number) => string;
  ariaLabel?: string;
}

// Same accent-first palette used elsewhere in the app (var(--accent) etc.),
// extended with a few extra tokens so a donut with more than 2-3 slices
// still reads distinctly. No dependency on a charting library — this is a
// dependency-free inline-SVG chart, same technique as RevenueTrendChart.
const PALETTE = [
  "var(--accent, #10b981)",
  "#2563eb",
  "#f59e0b",
  "#a855f7",
  "#ef4444",
  "#0891b2",
  "#84cc16",
  "#ec4899",
];

function defaultFormatter(value: number): string {
  return value.toLocaleString("en-IN");
}

export default function DonutChart({
  slices,
  size = 160,
  thickness = 26,
  loading = false,
  emptyMessage = "No data in this range.",
  valueFormatter = defaultFormatter,
  ariaLabel,
}: DonutChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = useMemo(() => slices.reduce((sum, s) => sum + (Number.isFinite(s.value) ? s.value : 0), 0), [slices]);

  const geometry = useMemo(() => {
    const r = (size - thickness) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    return slices.map((s, i) => {
      const v = Number.isFinite(s.value) ? s.value : 0;
      const fraction = total > 0 ? v / total : 0;
      const dash = fraction * circumference;
      const seg = {
        color: s.color || PALETTE[i % PALETTE.length],
        dashArray: `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`,
        dashOffset: -offset,
        fraction,
      };
      offset += dash;
      return seg;
    });
  }, [slices, total, size, thickness]);

  const r = (size - thickness) / 2;
  const active = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div className="donut-wrap">
      {loading ? (
        <div className="donut-state" style={{ width: size, height: size }}>
          <div className="donut-skeleton" />
        </div>
      ) : total === 0 ? (
        <div className="donut-state" style={{ width: size, height: size }}>
          <span className="donut-empty-text">{emptyMessage}</span>
        </div>
      ) : (
        <div className="donut-row">
          <div className="donut-svg-wrap" style={{ width: size, height: size }}>
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={ariaLabel || `${slices.length}-slice breakdown`}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="var(--border-subtle, #f1f5f9)"
                strokeWidth={thickness}
              />
              {geometry.map((seg, i) => (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={hoverIndex === i ? thickness + 4 : thickness}
                  strokeDasharray={seg.dashArray}
                  strokeDashoffset={seg.dashOffset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  style={{ transition: "stroke-width 0.15s ease", cursor: "pointer" }}
                  onMouseEnter={() => setHoverIndex(i)}
                />
              ))}
              <text x={size / 2} y={size / 2 - 4} textAnchor="middle" className="donut-center-value">
                {active ? valueFormatter(active.value) : valueFormatter(total)}
              </text>
              <text x={size / 2} y={size / 2 + 14} textAnchor="middle" className="donut-center-label">
                {active ? active.label : "Total"}
              </text>
            </svg>
          </div>

          <ul className="donut-legend">
            {slices.map((s, i) => (
              <li
                key={s.label}
                className={hoverIndex === i ? "is-active" : ""}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <span className="donut-swatch" style={{ background: geometry[i].color }} />
                <span className="donut-legend-label">{s.label}</span>
                <span className="donut-legend-value">{valueFormatter(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        .donut-wrap {
          width: 100%;
        }
        .donut-state {
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto;
        }
        .donut-empty-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
          text-align: center;
          padding: 0 12px;
        }
        .donut-skeleton {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--bg-subtle);
        }
        @media (prefers-reduced-motion: no-preference) {
          .donut-skeleton {
            animation: donutPulse 1.4s ease-in-out infinite;
          }
        }
        @keyframes donutPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .donut-row {
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .donut-svg-wrap {
          flex-shrink: 0;
        }
        .donut-center-value {
          font-size: 1rem;
          font-weight: 800;
          fill: var(--text-primary);
        }
        .donut-center-label {
          font-size: 0.6875rem;
          fill: var(--text-muted);
        }
        .donut-legend {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          min-width: 140px;
        }
        .donut-legend li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
          padding: 3px 6px;
          border-radius: var(--radius-sm, 6px);
          cursor: default;
        }
        .donut-legend li.is-active {
          background: var(--bg-subtle);
        }
        .donut-swatch {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .donut-legend-label {
          color: var(--text-secondary);
          flex: 1;
        }
        .donut-legend-value {
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
