import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OTHER_LABEL, OTHER_SERIES_COLOR, compactNumber, seriesColor, truncateLabel } from "./chart-palette";

/**
 * Dependency-free inline-SVG multi-series trend chart.
 *
 * components/RevenueTrendChart.tsx already does this for exactly one series
 * (revenue). The BI workbench needs N measures on one time axis, so this is the
 * same technique — hand-drawn axes, gridlines, crosshair and tooltip, no
 * charting library, no CDN — generalised to a series set, with the palette
 * pulled from components/chart-palette.ts (which is token-backed).
 */

export interface LineSeriesDef {
  key: string;
  label: string;
  color?: string;
}

export interface LinePointDatum {
  label: string;
  tooltipLabel?: string;
  /** seriesKey -> numeric value (already in display units). */
  values: Record<string, number>;
}

export interface MultiSeriesLineChartProps {
  points: LinePointDatum[];
  series: LineSeriesDef[];
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
  /** Formats tooltip values. Receives the series key so money vs count vs
   *  duration measures can format differently on the same chart. */
  valueFormatter?: (value: number, seriesKey: string) => string;
  ariaLabel?: string;
  /** Series beyond this are summed into a single "Other" line. Default 5 —
   *  more than that and the lines stop being separable by eye. */
  maxSeries?: number;
  onPointClick?: (index: number, point: LinePointDatum) => void;
}

const PAD_LEFT = 62;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;
const Y_TICKS = 4;

function defaultFormatter(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function MultiSeriesLineChart({
  points,
  series,
  height = 240,
  loading = false,
  emptyMessage = "No data in this range.",
  valueFormatter,
  ariaLabel,
  maxSeries = 5,
  onPointClick,
}: MultiSeriesLineChartProps) {
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

  // Cap the series count: fold the tail into one neutral "Other" line rather
  // than drawing a dozen indistinguishable strands.
  const shownSeries = useMemo<LineSeriesDef[]>(() => {
    const cap = Math.max(1, maxSeries);
    if (series.length <= cap) return series;
    const kept = series.slice(0, cap - 1);
    const folded = series.slice(cap - 1);
    return [...kept, { key: "__other_series__", label: `${OTHER_LABEL} (${folded.length})`, color: OTHER_SERIES_COLOR }];
  }, [series, maxSeries]);

  const shownPoints = useMemo<LinePointDatum[]>(() => {
    if (shownSeries === series) return points;
    const foldedKeys = series.slice(Math.max(1, maxSeries) - 1).map((s) => s.key);
    return points.map((p) => {
      const values: Record<string, number> = { ...p.values };
      values.__other_series__ = foldedKeys.reduce((sum, k) => sum + (Number(p.values[k]) || 0), 0);
      return { ...p, values };
    });
  }, [points, series, shownSeries, maxSeries]);

  const svgWidth = Math.max(320, width);
  const plotW = Math.max(60, svgWidth - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(40, height - PAD_TOP - PAD_BOTTOM);
  const fmt = valueFormatter || ((v: number) => defaultFormatter(v));

  const geometry = useMemo(() => {
    const values: number[] = [];
    for (const p of shownPoints) {
      for (const s of shownSeries) {
        const v = Number(p.values[s.key]);
        if (Number.isFinite(v)) values.push(v);
      }
    }
    const dataMax = values.length ? Math.max(...values) : 0;
    const dataMin = values.length ? Math.min(...values) : 0;
    let yMax = dataMax > 0 ? dataMax * 1.12 : 0;
    const yMin = dataMin < 0 ? dataMin * 1.12 : 0;
    if (yMax === yMin) yMax = yMin + 1;
    const span = yMax - yMin;

    const stepX = shownPoints.length > 1 ? plotW / (shownPoints.length - 1) : 0;
    const xAt = (i: number) => PAD_LEFT + (shownPoints.length > 1 ? i * stepX : plotW / 2);
    const yAt = (v: number) => PAD_TOP + plotH - ((v - yMin) / span) * plotH;

    const paths = shownSeries.map((s) =>
      shownPoints
        .map((p, i) => {
          const raw = Number(p.values[s.key]);
          const v = Number.isFinite(raw) ? raw : 0;
          return `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`;
        })
        .join(" ")
    );

    const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => {
      const value = yMin + (span * i) / Y_TICKS;
      return { value, y: yAt(value) };
    });

    const every = shownPoints.length > 1 ? Math.max(1, Math.ceil(58 / Math.max(stepX, 1))) : 1;

    return { xAt, yAt, paths, ticks, every, baseY: PAD_TOP + plotH, zeroY: yAt(0), yMin };
  }, [shownPoints, shownSeries, plotW, plotH]);

  const handleMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (shownPoints.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // The svg is scaled by viewBox, so map the DOM x back into user units.
      const scale = rect.width > 0 ? svgWidth / rect.width : 1;
      const x = (e.clientX - rect.left) * scale;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < shownPoints.length; i += 1) {
        const d = Math.abs(geometry.xAt(i) - x);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      setHoverIndex(nearest);
    },
    [geometry, shownPoints.length, svgWidth]
  );

  const hasData = shownPoints.length > 0;
  const active = hoverIndex !== null ? shownPoints[hoverIndex] : null;
  const activeX = hoverIndex !== null ? geometry.xAt(hoverIndex) : 0;
  const tooltipLeftPct = hasData ? Math.min(Math.max((activeX / svgWidth) * 100, 8), 92) : 50;

  const title =
    ariaLabel || `${shownSeries.map((s) => s.label).join(", ")} across ${shownPoints.length} periods`;

  return (
    <div className="ms-line-wrap" ref={wrapRef}>
      {loading ? (
        <div className="ms-state" style={{ height }}>
          <div className="ms-skeleton" />
        </div>
      ) : !hasData ? (
        <div className="ms-state" style={{ height }}>
          <span className="ms-empty-text">{emptyMessage}</span>
        </div>
      ) : (
        <>
          <svg
            className="ms-svg"
            viewBox={`0 0 ${svgWidth} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
            onClick={
              onPointClick && hoverIndex !== null
                ? () => onPointClick(hoverIndex, shownPoints[hoverIndex])
                : undefined
            }
            style={onPointClick ? { cursor: "pointer" } : undefined}
          >
            <title>{title}</title>

            {geometry.ticks.map((t, i) => (
              <g key={`t-${i}`}>
                <line x1={PAD_LEFT} y1={t.y} x2={svgWidth - PAD_RIGHT} y2={t.y} className="ms-gridline" />
                <text x={PAD_LEFT - 10} y={t.y + 4} className="ms-axis-text" textAnchor="end">
                  {compactNumber(t.value)}
                </text>
              </g>
            ))}

            {geometry.yMin < 0 && (
              <line x1={PAD_LEFT} y1={geometry.zeroY} x2={svgWidth - PAD_RIGHT} y2={geometry.zeroY} className="ms-zeroline" />
            )}

            {hoverIndex !== null && (
              <line x1={activeX} y1={PAD_TOP} x2={activeX} y2={geometry.baseY} className="ms-hoverline" />
            )}

            {shownSeries.map((s, si) => (
              <path
                key={s.key}
                d={geometry.paths[si]}
                fill="none"
                stroke={s.color || (s.key === "__other_series__" ? OTHER_SERIES_COLOR : seriesColor(si))}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {shownSeries.map((s, si) =>
              shownPoints.map((p, i) => {
                const raw = Number(p.values[s.key]);
                const v = Number.isFinite(raw) ? raw : 0;
                const r = hoverIndex === i ? 4 : shownPoints.length > 40 ? 0 : 2.2;
                if (r === 0) return null;
                return (
                  <circle
                    key={`${s.key}-${i}`}
                    cx={geometry.xAt(i)}
                    cy={geometry.yAt(v)}
                    r={r}
                    fill={hoverIndex === i ? s.color || seriesColor(si) : "var(--bg-card)"}
                    stroke={s.color || (s.key === "__other_series__" ? OTHER_SERIES_COLOR : seriesColor(si))}
                    strokeWidth={2}
                  />
                );
              })
            )}

            {shownPoints.map((p, i) =>
              i % geometry.every === 0 || i === shownPoints.length - 1 ? (
                <text
                  key={`lbl-${i}`}
                  x={geometry.xAt(i)}
                  y={height - 10}
                  className="ms-axis-text"
                  textAnchor="middle"
                >
                  {truncateLabel(p.label, 12)}
                  <title>{p.tooltipLabel || p.label}</title>
                </text>
              ) : null
            )}
          </svg>

          {active && (
            <div className="ms-tooltip" style={{ left: `${tooltipLeftPct}%` }}>
              <div className="ms-tooltip-title">{active.tooltipLabel || active.label}</div>
              {shownSeries.map((s, si) => (
                <div key={s.key} className="ms-tooltip-row">
                  <span
                    className="ms-swatch"
                    style={{ background: s.color || (s.key === "__other_series__" ? OTHER_SERIES_COLOR : seriesColor(si)) }}
                  />
                  <span className="ms-tooltip-key">{s.label}</span>
                  <span className="ms-tooltip-val">{fmt(Number(active.values[s.key]) || 0, s.key)}</span>
                </div>
              ))}
            </div>
          )}

          {shownSeries.length > 1 && (
            <ul className="ms-legend">
              {shownSeries.map((s, si) => (
                <li key={s.key}>
                  <span
                    className="ms-swatch"
                    style={{ background: s.color || (s.key === "__other_series__" ? OTHER_SERIES_COLOR : seriesColor(si)) }}
                  />
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <style jsx>{`
        .ms-line-wrap {
          position: relative;
          width: 100%;
        }
        .ms-svg {
          display: block;
          overflow: visible;
        }
        .ms-state {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ms-empty-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .ms-skeleton {
          width: 100%;
          height: 70%;
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
        }
        @media (prefers-reduced-motion: no-preference) {
          .ms-skeleton {
            animation: msPulse 1.4s ease-in-out infinite;
          }
        }
        @keyframes msPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
        .ms-tooltip {
          position: absolute;
          top: 6px;
          transform: translateX(-50%);
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-pop);
          padding: 8px 10px;
          pointer-events: none;
          min-width: 168px;
          z-index: 4;
        }
        .ms-tooltip-title {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 5px;
        }
        .ms-tooltip-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
        }
        .ms-tooltip-key {
          color: var(--text-secondary);
          flex: 1;
        }
        .ms-tooltip-val {
          font-weight: 700;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        .ms-legend {
          list-style: none;
          margin: 10px 0 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 16px;
        }
        .ms-legend li {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .ms-swatch {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .ms-gridline {
          stroke: var(--border-subtle);
          stroke-width: 1;
        }
        .ms-zeroline {
          stroke: var(--border);
          stroke-width: 1.5;
        }
        .ms-axis-text {
          fill: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
        }
        .ms-hoverline {
          stroke: var(--accent);
          stroke-width: 1;
          stroke-dasharray: 3 3;
          opacity: 0.55;
        }
      `}</style>
    </div>
  );
}
