import React, { useEffect, useMemo, useRef, useState } from "react";
import { OTHER_LABEL, OTHER_SERIES_COLOR, compactNumber, seriesColor, truncateLabel } from "./chart-palette";

/**
 * Dependency-free inline-SVG bar / column chart.
 *
 * This app has no charting library and no CDN access, so — exactly like
 * components/DonutChart.tsx and components/RevenueTrendChart.tsx — the bars,
 * axes, gridlines and legend are all drawn by hand here. Colours come from the
 * shared token-backed palette in components/chart-palette.ts.
 *
 * Supports grouped multi-series data in both orientations:
 *   - "vertical"   columns over a categorical x-axis (good for few, short labels)
 *   - "horizontal" bars down a categorical y-axis (good for long labels such as
 *                  item / customer / waiter names — the usual BI group-by)
 *
 * Negative measures (variance, adjustments) are plotted honestly against a zero
 * baseline rather than clamped to zero.
 */

export interface BarSeriesDef {
  key: string;
  label: string;
  /** Overrides the palette colour for this series. */
  color?: string;
}

export interface BarCategoryDatum {
  label: string;
  /** Longer text for the hover title. Falls back to `label`. */
  tooltipLabel?: string;
  /** seriesKey -> numeric value (already in display units). */
  values: Record<string, number>;
}

export interface BarChartProps {
  categories: BarCategoryDatum[];
  series: BarSeriesDef[];
  orientation?: "vertical" | "horizontal";
  /** Plot height in px. Vertical only — horizontal sizes itself from the row count. */
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
  /** Formats bar titles and (single-series horizontal) end labels. */
  valueFormatter?: (value: number, seriesKey: string) => string;
  ariaLabel?: string;
  /** Categories beyond this are summed into a single "Other" bar. Order is the
   *  caller's — this keeps the leading N and folds the tail, so a caller that
   *  sorted descending gets a real top-N + Other. Default 12. */
  maxCategories?: number;
  /** Series beyond this are summed into a single "Other" series. Default 6. */
  maxSeries?: number;
  onCategoryClick?: (index: number, category: BarCategoryDatum) => void;
}

const Y_TICKS = 4;

function defaultFormatter(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface CappedShape {
  series: BarSeriesDef[];
  categories: BarCategoryDatum[];
  /** Index into the caller's original `categories` for row i, or null for the
   *  synthetic "Other" row (which is not drillable). */
  sourceIndex: (number | null)[];
}

function capShape(
  categories: BarCategoryDatum[],
  series: BarSeriesDef[],
  maxCategories: number,
  maxSeries: number
): CappedShape {
  let outSeries = series;
  let outCategories = categories;

  if (series.length > maxSeries) {
    const kept = series.slice(0, maxSeries - 1);
    const folded = series.slice(maxSeries - 1);
    outSeries = [...kept, { key: "__other_series__", label: `${OTHER_LABEL} (${folded.length})`, color: OTHER_SERIES_COLOR }];
    outCategories = categories.map((c) => {
      const values: Record<string, number> = {};
      for (const s of kept) values[s.key] = Number(c.values[s.key]) || 0;
      values.__other_series__ = folded.reduce((sum, s) => sum + (Number(c.values[s.key]) || 0), 0);
      return { ...c, values };
    });
  }

  const sourceIndex: (number | null)[] = outCategories.map((_, i) => i);

  if (outCategories.length > maxCategories) {
    const kept = outCategories.slice(0, maxCategories - 1);
    const folded = outCategories.slice(maxCategories - 1);
    const values: Record<string, number> = {};
    for (const s of outSeries) {
      values[s.key] = folded.reduce((sum, c) => sum + (Number(c.values[s.key]) || 0), 0);
    }
    outCategories = [
      ...kept,
      {
        label: `${OTHER_LABEL} (${folded.length})`,
        tooltipLabel: `${folded.length} further rows, summed`,
        values,
      },
    ];
    return { series: outSeries, categories: outCategories, sourceIndex: [...sourceIndex.slice(0, maxCategories - 1), null] };
  }

  return { series: outSeries, categories: outCategories, sourceIndex };
}

function niceDomain(values: number[]): { min: number; max: number } {
  const finite = values.filter((v) => Number.isFinite(v));
  const dataMax = finite.length ? Math.max(...finite) : 0;
  const dataMin = finite.length ? Math.min(...finite) : 0;
  let max = dataMax > 0 ? dataMax * 1.12 : 0;
  const min = dataMin < 0 ? dataMin * 1.12 : 0;
  if (max === min) max = min + 1;
  return { min, max };
}

export default function BarChart({
  categories,
  series,
  orientation = "vertical",
  height = 240,
  loading = false,
  emptyMessage = "No data in this range.",
  valueFormatter,
  ariaLabel,
  maxCategories = 12,
  maxSeries = 6,
  onCategoryClick,
}: BarChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

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

  const shape = useMemo(
    () => capShape(categories, series, Math.max(2, maxCategories), Math.max(1, maxSeries)),
    [categories, series, maxCategories, maxSeries]
  );

  const fmt = valueFormatter || ((v: number) => defaultFormatter(v));

  const allValues = useMemo(() => {
    const out: number[] = [];
    for (const c of shape.categories) {
      for (const s of shape.series) out.push(Number(c.values[s.key]) || 0);
    }
    return out;
  }, [shape]);

  const domain = useMemo(() => niceDomain(allValues), [allValues]);

  const isHorizontal = orientation === "horizontal";
  const PAD_LEFT = isHorizontal ? 138 : 60;
  const PAD_RIGHT = isHorizontal ? 58 : 16;
  const PAD_TOP = isHorizontal ? 12 : 16;
  const PAD_BOTTOM = isHorizontal ? 30 : 40;

  const BAR_THICKNESS = 15;
  const ROW_GAP = 16;
  const rowSize = shape.series.length * BAR_THICKNESS + ROW_GAP;

  const svgWidth = Math.max(320, width);
  const svgHeight = isHorizontal
    ? PAD_TOP + PAD_BOTTOM + Math.max(1, shape.categories.length) * rowSize
    : height;

  const plotW = Math.max(60, svgWidth - PAD_LEFT - PAD_RIGHT);
  const plotH = Math.max(40, svgHeight - PAD_TOP - PAD_BOTTOM);

  const span = domain.max - domain.min || 1;
  const scaleValue = (v: number): number =>
    isHorizontal
      ? PAD_LEFT + ((v - domain.min) / span) * plotW
      : PAD_TOP + plotH - ((v - domain.min) / span) * plotH;
  const zeroPos = scaleValue(0);

  const ticks = useMemo(
    () =>
      Array.from({ length: Y_TICKS + 1 }, (_, i) => {
        const value = domain.min + (span * i) / Y_TICKS;
        return { value, pos: scaleValue(value) };
      }),
    [domain.min, domain.max, span, plotW, plotH, isHorizontal, PAD_LEFT, PAD_TOP]
  );

  const bandSize = isHorizontal ? rowSize : plotW / Math.max(1, shape.categories.length);
  const groupThickness = isHorizontal ? shape.series.length * BAR_THICKNESS : bandSize * 0.7;
  const barThickness = groupThickness / Math.max(1, shape.series.length);

  // Thin the vertical x-axis labels so they never collide.
  const labelEvery = isHorizontal ? 1 : Math.max(1, Math.ceil(58 / Math.max(bandSize, 1)));

  const hasData = shape.categories.length > 0 && allValues.some((v) => v !== 0);
  const clickable = typeof onCategoryClick === "function";

  const title = ariaLabel || `${shape.series.map((s) => s.label).join(", ")} by ${shape.categories.length} categories`;

  return (
    <div className="bar-chart-wrap" ref={wrapRef}>
      {loading ? (
        <div className="bar-state" style={{ height: isHorizontal ? 180 : height }}>
          <div className="bar-skeleton" />
        </div>
      ) : !hasData ? (
        <div className="bar-state" style={{ height: isHorizontal ? 180 : height }}>
          <span className="bar-empty-text">{emptyMessage}</span>
        </div>
      ) : (
        <>
          <svg
            className="bar-svg"
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            height={svgHeight}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={title}
            onMouseLeave={() => setHover(null)}
          >
            <title>{title}</title>

            {ticks.map((t, i) => (
              <g key={`tick-${i}`}>
                {isHorizontal ? (
                  <>
                    <line x1={t.pos} y1={PAD_TOP} x2={t.pos} y2={PAD_TOP + plotH} className="bar-gridline" />
                    <text x={t.pos} y={svgHeight - 10} className="bar-axis-text" textAnchor="middle">
                      {compactNumber(t.value)}
                    </text>
                  </>
                ) : (
                  <>
                    <line x1={PAD_LEFT} y1={t.pos} x2={svgWidth - PAD_RIGHT} y2={t.pos} className="bar-gridline" />
                    <text x={PAD_LEFT - 10} y={t.pos + 4} className="bar-axis-text" textAnchor="end">
                      {compactNumber(t.value)}
                    </text>
                  </>
                )}
              </g>
            ))}

            {/* zero baseline, drawn only when the domain actually crosses zero */}
            {domain.min < 0 && (
              isHorizontal ? (
                <line x1={zeroPos} y1={PAD_TOP} x2={zeroPos} y2={PAD_TOP + plotH} className="bar-zeroline" />
              ) : (
                <line x1={PAD_LEFT} y1={zeroPos} x2={svgWidth - PAD_RIGHT} y2={zeroPos} className="bar-zeroline" />
              )
            )}

            {shape.categories.map((cat, ci) => {
              const bandStart = isHorizontal ? PAD_TOP + ci * bandSize : PAD_LEFT + ci * bandSize;
              const groupStart = bandStart + (bandSize - groupThickness) / 2;
              const isHovered = hover === ci;

              return (
                <g
                  key={`cat-${ci}`}
                  className={isHovered ? "bar-group is-hovered" : "bar-group"}
                  onMouseEnter={() => setHover(ci)}
                  onClick={
                    clickable && shape.sourceIndex[ci] !== null
                      ? () => onCategoryClick!(shape.sourceIndex[ci] as number, categories[shape.sourceIndex[ci] as number])
                      : undefined
                  }
                  style={clickable && shape.sourceIndex[ci] !== null ? { cursor: "pointer" } : undefined}
                >
                  {/* invisible hit band so hover/click works in the gaps too */}
                  <rect
                    x={isHorizontal ? PAD_LEFT : bandStart}
                    y={isHorizontal ? bandStart : PAD_TOP}
                    width={isHorizontal ? plotW : bandSize}
                    height={isHorizontal ? bandSize : plotH}
                    fill="transparent"
                  />

                  {shape.series.map((s, si) => {
                    const raw = Number(cat.values[s.key]);
                    const v = Number.isFinite(raw) ? raw : 0;
                    const end = scaleValue(v);
                    const offset = groupStart + si * barThickness;
                    const color = s.color || (s.key === "__other_series__" ? OTHER_SERIES_COLOR : seriesColor(si));
                    const len = Math.abs(end - zeroPos);

                    return (
                      <rect
                        key={s.key}
                        x={isHorizontal ? Math.min(end, zeroPos) : offset}
                        y={isHorizontal ? offset : Math.min(end, zeroPos)}
                        width={isHorizontal ? Math.max(len, v === 0 ? 0 : 1) : Math.max(1, barThickness - 2)}
                        height={isHorizontal ? Math.max(1, barThickness - 2) : Math.max(len, v === 0 ? 0 : 1)}
                        fill={color}
                        rx={2}
                        opacity={hover === null || isHovered ? 1 : 0.4}
                      >
                        <title>{`${cat.tooltipLabel || cat.label} — ${s.label}: ${fmt(v, s.key)}`}</title>
                      </rect>
                    );
                  })}

                  {/* value label at the end of a single-series horizontal bar */}
                  {isHorizontal && shape.series.length === 1 && (
                    <text
                      x={Math.max(scaleValue(Number(cat.values[shape.series[0].key]) || 0), zeroPos) + 6}
                      y={groupStart + barThickness / 2 + 4}
                      className="bar-value-text"
                    >
                      {compactNumber(Number(cat.values[shape.series[0].key]) || 0)}
                    </text>
                  )}

                  {isHorizontal ? (
                    <text x={PAD_LEFT - 10} y={bandStart + bandSize / 2 + 4} className="bar-axis-text" textAnchor="end">
                      {truncateLabel(cat.label, 20)}
                      <title>{cat.tooltipLabel || cat.label}</title>
                    </text>
                  ) : ci % labelEvery === 0 || ci === shape.categories.length - 1 ? (
                    <text x={bandStart + bandSize / 2} y={svgHeight - 22} className="bar-axis-text" textAnchor="middle">
                      {truncateLabel(cat.label, 12)}
                      <title>{cat.tooltipLabel || cat.label}</title>
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {shape.series.length > 1 && (
            <ul className="bar-legend">
              {shape.series.map((s, si) => (
                <li key={s.key}>
                  <span
                    className="bar-swatch"
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
        .bar-chart-wrap {
          position: relative;
          width: 100%;
        }
        .bar-svg {
          display: block;
          overflow: visible;
        }
        .bar-state {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bar-empty-text {
          font-size: 0.8125rem;
          color: var(--text-muted);
        }
        .bar-skeleton {
          width: 100%;
          height: 70%;
          border-radius: var(--radius-md);
          background: var(--bg-subtle);
        }
        @media (prefers-reduced-motion: no-preference) {
          .bar-skeleton {
            animation: barPulse 1.4s ease-in-out infinite;
          }
        }
        @keyframes barPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
        .bar-legend {
          list-style: none;
          margin: 10px 0 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px 16px;
        }
        .bar-legend li {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .bar-swatch {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .bar-gridline {
          stroke: var(--border-subtle);
          stroke-width: 1;
        }
        .bar-zeroline {
          stroke: var(--border);
          stroke-width: 1.5;
        }
        .bar-axis-text {
          fill: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
        }
        .bar-value-text {
          fill: var(--text-secondary);
          font-size: 10px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
