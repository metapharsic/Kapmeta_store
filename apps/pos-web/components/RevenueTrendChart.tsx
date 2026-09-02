import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * A single plotted point. `value` is in MAJOR currency units (rupees), already
 * converted from the minor units the API serialises.
 */
export interface TrendPoint {
  /** Short x-axis label, e.g. "02 Sep". */
  label: string;
  /** Y value in major units. */
  value: number;
  /** Longer label shown in the hover tooltip. Falls back to `label`. */
  tooltipLabel?: string;
}

export interface RevenueTrendChartProps {
  points: TrendPoint[];
  /** Plot height in px (excludes the x-axis label strip). Default 190. */
  height?: number;
  /** Renders a skeleton instead of the plot. */
  loading?: boolean;
  /** Shown when `points` is empty and not loading. */
  emptyMessage?: string;
  /** Tooltip row label. Default "Revenue". */
  seriesName?: string;
  /** Formats y-axis ticks and the tooltip value. Default: "₹1,234.00". */
  valueFormatter?: (value: number) => string;
  /** Accessible description of the series. */
  ariaLabel?: string;
}

const PAD_LEFT = 62;
const PAD_RIGHT = 14;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const Y_TICKS = 4;

function defaultFormatter(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function compactTick(value: number): string {
  if (Math.abs(value) >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * Dependency-free inline-SVG line chart. No charting library is available to
 * this app (external CDNs are blocked), so the plot, axes, gridlines and hover
 * tooltip are all drawn here.
 */
export default function RevenueTrendChart({
  points,
  height = 190,
  loading = false,
  emptyMessage = "No revenue recorded in this range.",
  seriesName = "Revenue",
  valueFormatter = defaultFormatter,
  ariaLabel,
}: RevenueTrendChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const plotW = Math.max(60, width - PAD_LEFT - PAD_RIGHT);
    const plotH = Math.max(40, height - PAD_TOP - PAD_BOTTOM);
    const values = points.map((p) => (Number.isFinite(p.value) ? p.value : 0));
    const rawMax = values.length ? Math.max(...values) : 0;
    const yMax = rawMax > 0 ? rawMax * 1.12 : 1;
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const v = Number.isFinite(p.value) ? p.value : 0;
      return {
        x: PAD_LEFT + (points.length > 1 ? i * stepX : plotW / 2),
        y: PAD_TOP + plotH - (v / yMax) * plotH,
      };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
      .join(" ");

    const areaPath = coords.length
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(2)} ${(PAD_TOP + plotH).toFixed(
          2
        )} L${coords[0].x.toFixed(2)} ${(PAD_TOP + plotH).toFixed(2)} Z`
      : "";

    const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
      const ratio = i / Y_TICKS;
      return { value: yMax * ratio, y: PAD_TOP + plotH - ratio * plotH };
    });

    // Thin the x labels so they never collide on narrow screens.
    const minLabelSpace = 58;
    const every = points.length > 1 ? Math.max(1, Math.ceil(minLabelSpace / Math.max(stepX, 1))) : 1;

    return { plotW, plotH, coords, linePath, areaPath, ticks, stepX, every, baseY: PAD_TOP + plotH };
  }, [points, width, height]);

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (points.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      geometry.coords.forEach((c, i) => {
        const d = Math.abs(c.x - x);
        if (d < best) {
          best = d;
          nearest = i;
        }
      });
      setHoverIndex(nearest);
    },
    [geometry.coords, points.length]
  );

  const totalHeight = height;
  const active = hoverIndex !== null ? points[hoverIndex] : null;
  const activeCoord = hoverIndex !== null ? geometry.coords[hoverIndex] : null;

  const tooltipLeft = activeCoord
    ? Math.min(Math.max(activeCoord.x, 76), Math.max(width - 76, 76))
    : 0;

  return (
    <div className="trend-chart-wrap" ref={wrapRef}>
      {loading ? (
        <div className="trend-state" style={{ height: totalHeight }}>
          <div className="trend-skeleton" />
        </div>
      ) : points.length === 0 ? (
        <div className="trend-state" style={{ height: totalHeight }}>
          <span className="trend-empty-text">{emptyMessage}</span>
        </div>
      ) : (
        <>
          <svg
            className="trend-svg"
            width={width}
            height={totalHeight}
            role="img"
            aria-label={ariaLabel || `${seriesName} trend across ${points.length} points`}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {geometry.ticks.map((t, i) => (
              <g key={`tick-${i}`}>
                <line
                  x1={PAD_LEFT}
                  y1={t.y}
                  x2={width - PAD_RIGHT}
                  y2={t.y}
                  className="trend-gridline"
                />
                <text x={PAD_LEFT - 10} y={t.y + 4} className="trend-axis-text" textAnchor="end">
                  {compactTick(t.value)}
                </text>
              </g>
            ))}

            {geometry.areaPath && <path d={geometry.areaPath} className="trend-area" />}
            <path d={geometry.linePath} className="trend-line" />

            {activeCoord && (
              <line
                x1={activeCoord.x}
                y1={PAD_TOP}
                x2={activeCoord.x}
                y2={geometry.baseY}
                className="trend-hoverline"
              />
            )}

            {geometry.coords.map((c, i) => (
              <circle
                key={`pt-${i}`}
                cx={c.x}
                cy={c.y}
                r={hoverIndex === i ? 4.5 : points.length > 40 ? 0 : 2.5}
                className={hoverIndex === i ? "trend-dot is-active" : "trend-dot"}
              />
            ))}

            {points.map((p, i) =>
              i % geometry.every === 0 || i === points.length - 1 ? (
                <text
                  key={`lbl-${i}`}
                  x={geometry.coords[i].x}
                  y={totalHeight - 8}
                  className="trend-axis-text"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              ) : null
            )}
          </svg>

          {active && activeCoord && (
            <div className="trend-tooltip" style={{ left: tooltipLeft, top: Math.max(activeCoord.y - 8, 4) }}>
              <div className="trend-tooltip-title">{active.tooltipLabel || active.label}</div>
              <div className="trend-tooltip-row">
                <span className="trend-tooltip-key">{seriesName}</span>
                <span className="trend-tooltip-val">{valueFormatter(active.value)}</span>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .trend-chart-wrap {
          position: relative;
          width: 100%;
        }
        .trend-svg {
          display: block;
          overflow: visible;
        }
        .trend-state {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .trend-empty-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .trend-skeleton {
          width: 100%;
          height: 60%;
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
        }
        @media (prefers-reduced-motion: no-preference) {
          .trend-skeleton {
            animation: trendPulse 1.4s ease-in-out infinite;
          }
        }
        @keyframes trendPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
        .trend-tooltip {
          position: absolute;
          transform: translate(-50%, -100%);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-pop);
          padding: 8px 10px;
          pointer-events: none;
          min-width: 132px;
          z-index: 4;
        }
        .trend-tooltip-title {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
        }
        .trend-tooltip-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
        }
        .trend-tooltip-key {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .trend-tooltip-val {
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .trend-gridline {
          stroke: var(--border-subtle);
          stroke-width: 1;
        }
        .trend-axis-text {
          fill: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
        }
        .trend-area {
          fill: var(--accent);
          fill-opacity: 0.12;
        }
        .trend-line {
          fill: none;
          stroke: var(--accent);
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .trend-hoverline {
          stroke: var(--accent);
          stroke-width: 1;
          stroke-dasharray: 3 3;
          opacity: 0.55;
        }
        .trend-dot {
          fill: var(--bg-card);
          stroke: var(--accent);
          stroke-width: 2;
          transition: r 0.15s ease;
        }
        .trend-dot.is-active {
          fill: var(--accent);
        }
        @media (prefers-reduced-motion: reduce) {
          .trend-dot {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
