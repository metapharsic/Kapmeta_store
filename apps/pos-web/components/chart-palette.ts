// Shared series colours for the dependency-free inline-SVG charts in this app
// (components/DonutChart.tsx, components/BarChart.tsx,
// components/MultiSeriesLineChart.tsx).
//
// This is NOT a new palette: it is the accent-first sequence
// components/DonutChart.tsx already shipped, re-expressed against the design
// tokens defined in pages/_app.tsx (:root) so a theme change moves the charts
// with the rest of the app. The last three entries stay literals for the same
// reason DonutChart kept them — the token set has no further hues that stay
// legible next to the five above, and a chart with 6-8 series still has to be
// readable. Each var() fallback is that token's real value in _app.tsx.
export const CHART_SERIES_COLORS: string[] = [
  "var(--accent, #10b981)",
  "var(--blue-text, #1d4ed8)",
  "var(--warning, #f59e0b)",
  "var(--purple-text, #7e22ce)",
  "var(--color-coral, #f43f5e)",
  "#0891b2",
  "#84cc16",
  "#ec4899",
];

/** Colour for the grouped tail bucket ("Other"). Deliberately neutral so it
 *  never reads as one more real category. */
export const OTHER_SERIES_COLOR = "var(--text-muted, #a1a1aa)";

/** Label used for the grouped tail bucket, so charts and legends agree. */
export const OTHER_LABEL = "Other";

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

/** Compact axis ticks: 1.2K / 3.4L / 1.1Cr (Indian grouping, same convention
 *  as components/RevenueTrendChart.tsx). */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (!Number.isInteger(value)) return value.toFixed(2);
  return String(value);
}

/** Truncates an axis label to `max` chars. The full text is always kept in an
 *  SVG <title> by the callers, so nothing is actually lost. */
export function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(1, max - 1))}…`;
}
