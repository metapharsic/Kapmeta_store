import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { authedFetch, useAuthGuard } from "../../lib/auth";
import Nav from "../../components/Nav";
import BarChart, { BarCategoryDatum, BarSeriesDef } from "../../components/BarChart";
import MultiSeriesLineChart, { LinePointDatum, LineSeriesDef } from "../../components/MultiSeriesLineChart";
import DonutChart from "../../components/DonutChart";
import { seriesColor } from "../../components/chart-palette";

/* ==========================================================================
 * BI Reports workbench — /reports/bi
 *
 * Every dataset, dimension, measure, grain and row on this screen comes from
 * the real BI API in apps/api/src/routes/bi.ts:
 *
 *   GET /bi/catalog     -> the dataset catalog (domains, dimensions, measures)
 *   GET /bi/query       -> aggregated rows + totals for one dataset
 *   GET /bi/drilldown   -> the raw underlying records behind one aggregate row
 *
 * Nothing here is hardcoded: the domain rail, the group-by picker, the measure
 * picker and the grain toggle are all rendered from whatever /bi/catalog
 * actually returns. If the catalog gains a domain tomorrow, this page shows it
 * with no edit. If the API is unavailable, this page says so — it never
 * substitutes invented rows for missing data.
 *
 * Money convention (same as the rest of this app): measures whose catalog unit
 * is "minor" cross the wire as stringified-BigInt minor units (paise) —
 * bi.ts casts every money aggregate ::bigint and serialises it to a string. They are converted to major
 * units by string surgery (minorToMajorString) rather than float division, so
 * the exported/displayed value is exact; the float form is only ever used to
 * position a pixel in a chart.
 * ========================================================================== */

interface BiDimension {
  key: string;
  label?: string;
  /** The real, qualified DB column this dimension reads — bi.ts marks it
   *  "documentation only", which is exactly what this screen wants it for. */
  sqlColumn?: string;
}

interface BiMeasure {
  key: string;
  label?: string;
  /** bi.ts MeasureUnit: "minor" | "count" | "quantity" | "seconds" | "percent".
   *  Typed loosely here so an added unit degrades to a plain number instead of
   *  breaking the screen. */
  unit?: string;
}

interface BiDataset {
  domain?: string;
  key: string;
  label?: string;
  description?: string;
  sourceTables?: string[];
  dimensions?: BiDimension[];
  measures?: BiMeasure[];
  defaultGrain?: string | null;
  defaultGroupBy?: string | string[] | null;
  requiresPermission?: string;
  /** bi.ts ships a per-dataset caveat here (e.g. "this table has only one
   *  writer, so an empty result means nothing was logged"). Surfaced verbatim. */
  note?: string;
  /** bi.ts publicDataset(): non-null when this dataset's aggregation is
   *  delegated to an existing reporting calculation instead of the SQL engine. */
  delegated?: string | null;
  /** bi.ts: grain -> the dimension key that grain resolves to. Its
   *  publicDataset() flattens this to `grains`; both shapes are accepted. */
  grainDimensions?: Record<string, string>;
  /** bi.ts applies these unless the caller filters the same dimension. */
  defaultFilters?: Record<string, string | string[]>;
  /** Tolerated alternative spelling if the catalog ever ships a plain list. */
  grains?: string[];
}

interface BiQueryResponse {
  dataset?: string;
  groupBy?: string | string[];
  measures?: string | string[];
  rows?: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  rowCount?: number;
  truncated?: boolean;
  generatedAt?: string;
  note?: string;
}

interface ActiveFilter {
  dimension: string;
  value: string;
}

type PresetId = "today" | "7d" | "30d" | "mtd" | "custom";
type ChartKind = "bar" | "line" | "donut";
type MeasureKind = "money" | "percent" | "duration" | "count";

const ROW_LIMIT = 500;
const GRAIN_FALLBACK = ["hour", "day", "week", "month"];

/* ---------------------------------------------------------------- helpers */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function rangeForPreset(preset: PresetId, current: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: isoDate(now), to: isoDate(now) };
    case "7d":
      return { from: isoDate(shiftDays(now, -6)), to: isoDate(now) };
    case "30d":
      return { from: isoDate(shiftDays(now, -29)), to: isoDate(now) };
    case "mtd":
      return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
    default:
      return current;
  }
}

function measureKind(m: BiMeasure | undefined): MeasureKind {
  const unit = (m?.unit || "").toLowerCase();
  const key = m?.key || "";
  if (/(currency|money|inr|rupee|paise|minor|amount)/.test(unit) || /minor$/i.test(key)) return "money";
  if (/(percent|pct|%|ratio)/.test(unit) || /percent$/i.test(key)) return "percent";
  if (/(sec|second|minute|min\b|ms|milli|duration)/.test(unit)) return "duration";
  return "count";
}

/**
 * Exact minor-units -> major-units conversion. Money arrives as a stringified
 * BigInt, so this shifts the decimal point in the string instead of running it
 * through a float — no precision loss, nothing re-stored from a rounded value.
 */
function minorToMajorString(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (s === "") return "";
  if (/^-?\d+$/.test(s)) {
    const neg = s.startsWith("-");
    const digits = (neg ? s.slice(1) : s).padStart(3, "0");
    return `${neg ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : "";
}

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.abs(seconds);
  if (s < 60) return `${Math.round(seconds)}s`;
  const totalMinutes = Math.floor(s / 60);
  const remSeconds = Math.round(s % 60);
  if (totalMinutes < 60) return `${seconds < 0 ? "-" : ""}${totalMinutes}m ${remSeconds}s`;
  const hours = Math.floor(totalMinutes / 60);
  return `${seconds < 0 ? "-" : ""}${hours}h ${totalMinutes % 60}m`;
}

/** Numeric value in DISPLAY units — chart geometry only. */
function measureNumber(value: unknown, m: BiMeasure | undefined): number {
  const kind = measureKind(m);
  if (value === null || value === undefined || value === "") return 0;
  if (kind === "money") {
    const n = Number(minorToMajorString(value));
    return Number.isFinite(n) ? n : 0;
  }
  const unit = (m?.unit || "").toLowerCase();
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (kind === "duration" && /(^|[^a-z])ms|milli/.test(unit)) return n / 1000;
  return n;
}

function formatMeasure(value: unknown, m: BiMeasure | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const kind = measureKind(m);
  if (kind === "money") {
    const major = minorToMajorString(value);
    if (major === "") return String(value);
    return `₹${Number(major).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (kind === "percent") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%` : String(value);
  }
  if (kind === "duration") return formatDurationSeconds(measureNumber(value, m));
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(value);
}

/** CSV/plain form: exact, unformatted, spreadsheet-parsable. */
function measureCsvValue(value: unknown, m: BiMeasure | undefined): string {
  if (value === null || value === undefined) return "";
  if (measureKind(m) === "money") return minorToMajorString(value);
  return String(value);
}

function dimensionText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((v) => (isPlainObject(v) ? JSON.stringify(v) : String(v))).join(", ");
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

function toArray(v: string | string[] | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (typeof v === "string" && v.length > 0) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/**
 * Filter encoding for /bi/query and /bi/drilldown. bi.ts takes one `filters`
 * query param holding a JSON object of dimensionKey -> value (its own `sales`
 * dataset documents it as `filters={"status":...}`, and its BiDataset
 * `defaultFilters` is typed Record<string, string | string[]>). A value may be
 * an array server-side; this UI only ever sends the single-value form. Kept in
 * one place so the wire format is a one-line change if that ever moves.
 */
function encodeFilters(filters: ActiveFilter[]): string {
  const obj: Record<string, string> = {};
  for (const f of filters) obj[f.dimension] = f.value;
  return JSON.stringify(obj);
}

async function readApiError(res: Response, endpoint: string): Promise<string> {
  if (res.status === 404) {
    return `${endpoint} returned 404 — the BI API is not available on this server yet.`;
  }
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    if (typeof body?.message === "string") return body.message;
    return `${endpoint} failed with HTTP ${res.status}.`;
  } catch {
    return `${endpoint} failed with HTTP ${res.status} ${res.statusText || ""}`.trim();
  }
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/* ------------------------------------------------------------------- page */

export default function BiReportsPage(): JSX.Element | null {
  const { me, loading: authLoading } = useAuthGuard("report.read");

  const [catalog, setCatalog] = useState<BiDataset[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});

  const initialRange = useMemo(() => rangeForPreset("7d", { from: "", to: "" }), []);
  const [preset, setPreset] = useState<PresetId>("7d");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const [grain, setGrain] = useState<string>("");
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [newFilterDim, setNewFilterDim] = useState("");
  const [newFilterValue, setNewFilterValue] = useState("");

  const [result, setResult] = useState<BiQueryResponse | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [chartKind, setChartKind] = useState<ChartKind>("bar");
  const [chartMeasure, setChartMeasure] = useState<string>("");
  const [overlay, setOverlay] = useState(false);

  const [drillOpen, setDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState("");
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<Record<string, unknown>[]>([]);

  const requestSeq = useRef(0);

  /* ----------------------------------------------------------- catalog */

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    authedFetch("/bi/catalog")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res, "GET /bi/catalog"));
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("GET /bi/catalog did not return a list of datasets.");
        return data as BiDataset[];
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data.filter((d) => d && typeof d.key === "string"));
        setCatalogLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalogError(err instanceof Error ? err.message : String(err));
        setCatalog(null);
        setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  const isSuperAdmin = useMemo(
    () =>
      !!me &&
      Array.isArray(me.roles) &&
      (me.roles.includes("SUPER_ADMIN") || me.roles.includes("SUPERADMIN") || me.roles.includes("OWNER")),
    [me]
  );

  // Client-side mirror of the permission the API enforces server-side, so a
  // user is not shown a dataset that will only ever 403 (same convention as
  // Nav.tsx / lib/report-catalog.ts).
  const visibleCatalog = useMemo(() => {
    if (!catalog) return [];
    if (isSuperAdmin || !me) return catalog;
    return catalog.filter((d) => !d.requiresPermission || me.permissions.includes(d.requiresPermission));
  }, [catalog, isSuperAdmin, me]);

  const domains = useMemo(() => {
    const map = new Map<string, BiDataset[]>();
    for (const d of visibleCatalog) {
      const key = d.domain || "other";
      const list = map.get(key);
      if (list) list.push(d);
      else map.set(key, [d]);
    }
    return Array.from(map.entries());
  }, [visibleCatalog]);

  const active = useMemo(
    () => visibleCatalog.find((d) => d.key === activeKey) || null,
    [visibleCatalog, activeKey]
  );

  const dimensions = useMemo<BiDimension[]>(() => active?.dimensions ?? [], [active]);
  const measures = useMemo<BiMeasure[]>(() => active?.measures ?? [], [active]);
  const measureByKey = useMemo(() => {
    const map = new Map<string, BiMeasure>();
    for (const m of measures) map.set(m.key, m);
    return map;
  }, [measures]);

  // bi.ts declares grains as `grainDimensions` (grain -> dimension key). Only
  // the grains a dataset actually declares are offered.
  const grainDimensionMap = useMemo<Record<string, string>>(() => {
    if (!active) return {};
    if (active.grainDimensions && typeof active.grainDimensions === "object") {
      const out: Record<string, string> = {};
      for (const [g, dim] of Object.entries(active.grainDimensions)) {
        if (typeof dim === "string" && dim) out[g] = dim;
      }
      return out;
    }
    if (Array.isArray(active.grains)) {
      const out: Record<string, string> = {};
      for (const g of active.grains) out[g] = g;
      return out;
    }
    return {};
  }, [active]);

  const grainOptions = useMemo<string[]>(() => {
    if (!active) return [];
    const declared = Object.keys(grainDimensionMap);
    if (declared.length > 0) return declared;
    if (active.defaultGrain) return GRAIN_FALLBACK;
    return [];
  }, [active, grainDimensionMap]);

  // Changing the grain also swaps the time dimension in group-by, so the toggle
  // visibly re-buckets the rows instead of only changing a query param the
  // group-by then contradicts.
  const applyGrain = useCallback(
    (next: string) => {
      setGrain(next);
      const target = grainDimensionMap[next];
      if (!target) return;
      const grainDims = new Set(Object.values(grainDimensionMap));
      setGroupBy((prev) => {
        if (!prev.some((k) => grainDims.has(k))) return prev;
        const swapped = prev.map((k) => (grainDims.has(k) ? target : k));
        return Array.from(new Set(swapped));
      });
    },
    [grainDimensionMap]
  );

  // Select the first dataset once the catalog lands.
  useEffect(() => {
    if (activeKey || visibleCatalog.length === 0) return;
    setActiveKey(visibleCatalog[0].key);
    setOpenDomains({ [visibleCatalog[0].domain || "other"]: true });
  }, [visibleCatalog, activeKey]);

  // Reset the query shape to the dataset's declared defaults whenever the
  // active dataset changes.
  useEffect(() => {
    if (!active) return;
    const declaredDefault = toArray(active.defaultGroupBy).filter((k) =>
      (active.dimensions ?? []).some((d) => d.key === k)
    );
    const nextGroupBy =
      declaredDefault.length > 0
        ? declaredDefault
        : (active.dimensions ?? []).slice(0, 1).map((d) => d.key);
    const allMeasures = (active.measures ?? []).map((m) => m.key);
    const nextMeasures = allMeasures.slice(0, Math.min(4, allMeasures.length));

    setGroupBy(nextGroupBy);
    setSelectedMeasures(nextMeasures);
    setGrain(active.defaultGrain || "");
    setFilters([]);
    setNewFilterDim("");
    setNewFilterValue("");
    setSortKey(nextMeasures[0] || null);
    setSortDir("desc");
    setChartMeasure(nextMeasures[0] || "");
    setOverlay(false);
    setChartKind(active.defaultGrain ? "line" : "bar");
    setResult(null);
    setQueryError(null);
    setHasRun(false);
  }, [active]);

  /* ------------------------------------------------------------- query */

  const runQuery = useCallback(async () => {
    if (!active) return;
    if (groupBy.length === 0 && selectedMeasures.length === 0) {
      setQueryError("Pick at least one measure before running the query.");
      return;
    }
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setQueryLoading(true);
    setQueryError(null);
    setHasRun(true);

    const params = new URLSearchParams();
    params.set("dataset", active.key);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (groupBy.length > 0) params.set("groupBy", groupBy.join(","));
    if (selectedMeasures.length > 0) params.set("measures", selectedMeasures.join(","));
    if (grain) params.set("grain", grain);
    if (filters.length > 0) params.set("filters", encodeFilters(filters));
    params.set("limit", String(ROW_LIMIT));
    if (sortKey) {
      params.set("sort", sortKey);
      params.set("order", sortDir);
    }

    try {
      const res = await authedFetch(`/bi/query?${params.toString()}`);
      if (!res.ok) throw new Error(await readApiError(res, "GET /bi/query"));
      const data = (await res.json()) as BiQueryResponse;
      if (requestSeq.current !== seq) return;
      setResult(data);
      setQueryLoading(false);
    } catch (err: unknown) {
      if (requestSeq.current !== seq) return;
      setResult(null);
      setQueryError(err instanceof Error ? err.message : String(err));
      setQueryLoading(false);
    }
  }, [active, from, to, groupBy, selectedMeasures, grain, filters, sortKey, sortDir]);

  // Auto-run once per dataset selection so the workbench is never a blank slate.
  useEffect(() => {
    if (!active || hasRun) return;
    if (selectedMeasures.length === 0) return;
    runQuery();
  }, [active, hasRun, selectedMeasures, runQuery]);

  const rows = useMemo<Record<string, unknown>[]>(
    () => (Array.isArray(result?.rows) ? (result!.rows as Record<string, unknown>[]) : []),
    [result]
  );

  const responseGroupBy = useMemo(() => {
    const fromResponse = toArray(result?.groupBy);
    return fromResponse.length > 0 ? fromResponse : groupBy;
  }, [result, groupBy]);

  const responseMeasures = useMemo(() => {
    const fromResponse = toArray(result?.measures);
    return fromResponse.length > 0 ? fromResponse : selectedMeasures;
  }, [result, selectedMeasures]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const m = measureByKey.get(sortKey);
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (m) {
        cmp = measureNumber(av, m) - measureNumber(bv, m);
      } else {
        const as = dimensionText(av);
        const bs = dimensionText(bv);
        const an = Number(as);
        const bn = Number(bs);
        cmp = Number.isFinite(an) && Number.isFinite(bn) && as !== "" && bs !== "" ? an - bn : as.localeCompare(bs);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, measureByKey]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(measureByKey.has(key) ? "desc" : "asc");
    }
  };

  /* -------------------------------------------------------------- chart */

  const rowLabel = useCallback(
    (row: Record<string, unknown>): string => {
      if (responseGroupBy.length === 0) return "All";
      return responseGroupBy.map((g) => dimensionText(row[g])).join(" · ");
    },
    [responseGroupBy]
  );

  const chartMeasureKeys = useMemo(() => {
    const primary = chartMeasure && responseMeasures.includes(chartMeasure) ? chartMeasure : responseMeasures[0];
    if (!primary) return [];
    if (!overlay) return [primary];
    const kind = measureKind(measureByKey.get(primary));
    // Only overlay measures that share a unit kind — plotting rupees and order
    // counts on one axis would misrepresent both.
    return responseMeasures.filter((k) => measureKind(measureByKey.get(k)) === kind);
  }, [chartMeasure, responseMeasures, overlay, measureByKey]);

  const overlayCandidates = useMemo(() => {
    const primary = chartMeasure && responseMeasures.includes(chartMeasure) ? chartMeasure : responseMeasures[0];
    if (!primary) return 0;
    const kind = measureKind(measureByKey.get(primary));
    return responseMeasures.filter((k) => measureKind(measureByKey.get(k)) === kind).length;
  }, [chartMeasure, responseMeasures, measureByKey]);

  const chartSeries = useMemo<BarSeriesDef[] & LineSeriesDef[]>(
    () =>
      chartMeasureKeys.map((k, i) => ({
        key: k,
        label: measureByKey.get(k)?.label || humanize(k),
        color: seriesColor(i),
      })) as BarSeriesDef[] & LineSeriesDef[],
    [chartMeasureKeys, measureByKey]
  );

  const chartData = useMemo<BarCategoryDatum[] & LinePointDatum[]>(() => {
    return sortedRows.map((row) => {
      const values: Record<string, number> = {};
      for (const k of chartMeasureKeys) values[k] = measureNumber(row[k], measureByKey.get(k));
      const label = rowLabel(row);
      return { label, tooltipLabel: label, values };
    }) as BarCategoryDatum[] & LinePointDatum[];
  }, [sortedRows, chartMeasureKeys, measureByKey, rowLabel]);

  const chartValueFormatter = useCallback(
    (value: number, key: string): string => {
      const m = measureByKey.get(key);
      const kind = measureKind(m);
      if (kind === "money") {
        return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (kind === "percent") return `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
      if (kind === "duration") return formatDurationSeconds(value);
      return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    },
    [measureByKey]
  );

  const donutSlices = useMemo(() => {
    const key = chartMeasureKeys[0];
    if (!key) return [];
    return sortedRows
      .map((row, i) => ({
        label: rowLabel(row),
        value: Math.max(0, measureNumber(row[key], measureByKey.get(key))),
        color: seriesColor(i),
      }))
      .filter((s) => s.value > 0)
      .slice(0, 8);
  }, [sortedRows, chartMeasureKeys, measureByKey, rowLabel]);

  const donutAvailable = responseGroupBy.length > 0 && sortedRows.length > 0 && sortedRows.length <= 24;

  /* ---------------------------------------------------------- drilldown */

  const openDrilldown = useCallback(
    async (row: Record<string, unknown>) => {
      if (!active) return;
      const rowFilters: ActiveFilter[] = [...filters];
      for (const g of responseGroupBy) {
        const raw = row[g];
        if (raw === null || raw === undefined) continue;
        rowFilters.push({ dimension: g, value: String(raw) });
      }
      setDrillOpen(true);
      setDrillLoading(true);
      setDrillError(null);
      setDrillRows([]);
      setDrillTitle(rowLabel(row));

      const params = new URLSearchParams();
      params.set("dataset", active.key);
      params.set("filters", encodeFilters(rowFilters));
      // from/to are not in the documented drilldown signature but are harmless
      // extras: the raw records must be constrained to the same window the
      // aggregate row was computed over, or the panel would contradict the table.
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      try {
        const res = await authedFetch(`/bi/drilldown?${params.toString()}`);
        if (!res.ok) throw new Error(await readApiError(res, "GET /bi/drilldown"));
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : null;
        if (!list) throw new Error("GET /bi/drilldown did not return a list of records.");
        setDrillRows(list as Record<string, unknown>[]);
        setDrillLoading(false);
      } catch (err: unknown) {
        setDrillError(err instanceof Error ? err.message : String(err));
        setDrillLoading(false);
      }
    },
    [active, filters, responseGroupBy, rowLabel, from, to]
  );

  useEffect(() => {
    if (!drillOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrillOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drillOpen]);

  const drillColumns = useMemo(() => {
    const cols: string[] = [];
    const seen = new Set<string>();
    for (const r of drillRows) {
      if (!isPlainObject(r)) continue;
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      }
    }
    return cols;
  }, [drillRows]);

  /* --------------------------------------------------------------- CSV */

  const exportCsv = useCallback(() => {
    if (!active || sortedRows.length === 0) return;
    const cols = [...responseGroupBy, ...responseMeasures];
    const header = cols.map((c) => {
      const m = measureByKey.get(c);
      if (m) {
        const unitSuffix = measureKind(m) === "money" ? " (INR)" : m.unit ? ` (${m.unit})` : "";
        return csvCell(`${m.label || humanize(c)}${unitSuffix}`);
      }
      const d = dimensions.find((x) => x.key === c);
      return csvCell(d?.label || humanize(c));
    });

    const body = sortedRows.map((row) =>
      cols
        .map((c) => {
          const m = measureByKey.get(c);
          return csvCell(m ? measureCsvValue(row[c], m) : dimensionText(row[c]) === "—" ? "" : dimensionText(row[c]));
        })
        .join(",")
    );

    const totals = result?.totals;
    const totalLine = isPlainObject(totals)
      ? cols
          .map((c, i) => {
            const m = measureByKey.get(c);
            if (m) return csvCell(measureCsvValue(totals[c], m));
            return i === 0 ? csvCell("TOTAL") : "";
          })
          .join(",")
      : null;

    const meta = [
      `# Dataset,${csvCell(active.label || active.key)}`,
      `# Date range,${csvCell(`${from} to ${to}`)}`,
      grain ? `# Grain,${csvCell(grain)}` : null,
      filters.length > 0 ? `# Filters,${csvCell(filters.map((f) => `${f.dimension}=${f.value}`).join("; "))}` : null,
      result?.generatedAt ? `# Generated at,${csvCell(String(result.generatedAt))}` : null,
      result?.truncated ? `# Note,${csvCell(`Server capped the result at ${sortedRows.length} rows`)}` : null,
    ].filter((l): l is string => l !== null);

    const csv = [...meta, header.join(","), ...body, ...(totalLine ? [totalLine] : [])].join("\r\n");
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bi-${active.key}-${from}-to-${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [active, sortedRows, responseGroupBy, responseMeasures, measureByKey, dimensions, result, from, to, grain, filters]);

  /* ------------------------------------------------------------ actions */

  const applyPreset = (p: PresetId) => {
    setPreset(p);
    if (p === "custom") return;
    const r = rangeForPreset(p, { from, to });
    setFrom(r.from);
    setTo(r.to);
  };

  const toggleGroupBy = (key: string) => {
    setGroupBy((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleMeasure = (key: string) => {
    setSelectedMeasures((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (!next.includes(chartMeasure)) setChartMeasure(next[0] || "");
      return next;
    });
  };

  const addFilter = () => {
    if (!newFilterDim || newFilterValue.trim() === "") return;
    setFilters((prev) => [
      ...prev.filter((f) => f.dimension !== newFilterDim),
      { dimension: newFilterDim, value: newFilterValue.trim() },
    ]);
    setNewFilterValue("");
  };

  const addFilterFromCell = (dimension: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    setFilters((prev) => [...prev.filter((f) => f.dimension !== dimension), { dimension, value: String(value) }]);
  };

  const dimensionLabel = (key: string) => dimensions.find((d) => d.key === key)?.label || humanize(key);
  const measureLabel = (key: string) => measureByKey.get(key)?.label || humanize(key);

  if (authLoading) return null;

  const noAccess = me && !isSuperAdmin && !me.permissions.includes("report.read");

  return (
    <div className="bi-app">
      <Head>
        <title>KapMeta POS - BI Reports</title>
        <meta name="description" content="Business intelligence workbench — every dataset, dimension and measure the outlet exposes." />
      </Head>

      <div style={{ display: "flex", flex: 1, minHeight: "100vh" }}>
        <Nav variant="sidebar" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <main className="dashboard-body">
            <section className="dashboard-greeting-row">
              <div>
                <span className="breadcrumb-line">Reports</span>
                <h1 className="greeting-title">BI Reports</h1>
                <p className="greeting-subtitle">
                  Every BI dataset this outlet exposes — slice it by its own real dimensions, measure it with its own
                  real measures, and drill straight through to the underlying records.
                </p>
              </div>
              <Link href="/reports/other-reports" className="bi-ghost-link">
                All Other Reports &rarr;
              </Link>
            </section>

            {noAccess ? (
              <div className="empty-state-card">
                <span className="empty-icon">🚫</span>
                <h3>No report access</h3>
                <p>Your role does not grant the &quot;report.read&quot; permission required to open BI Reports.</p>
              </div>
            ) : catalogLoading ? (
              <div className="empty-state-card">
                <span className="empty-icon">⏳</span>
                <h3>Loading the BI catalog…</h3>
                <p>Fetching GET /bi/catalog.</p>
              </div>
            ) : catalogError ? (
              <div className="bi-error-card">
                <h3>Could not load the BI catalog</h3>
                <p className="bi-error-message">{catalogError}</p>
                <p className="bi-error-hint">
                  Nothing is shown below because there is no catalog to show — this screen never substitutes made-up
                  datasets for a failed request.
                </p>
              </div>
            ) : visibleCatalog.length === 0 ? (
              <div className="empty-state-card">
                <span className="empty-icon">🗂️</span>
                <h3>No BI datasets available</h3>
                <p>GET /bi/catalog returned no datasets your role is allowed to query.</p>
              </div>
            ) : (
              <div className="bi-layout">
                {/* ------------------------------------------- left rail */}
                <nav className="bi-rail" aria-label="BI domains">
                  {domains.map(([domain, datasets]) => {
                    const isOpen = openDomains[domain] ?? datasets.some((d) => d.key === activeKey);
                    return (
                      <div key={domain} className="bi-rail-group">
                        <button
                          type="button"
                          className="bi-rail-header"
                          aria-expanded={isOpen}
                          onClick={() => setOpenDomains((prev) => ({ ...prev, [domain]: !isOpen }))}
                        >
                          <span>{humanize(domain)}</span>
                          <span className="bi-rail-count">{datasets.length}</span>
                          <span className={isOpen ? "bi-chevron is-open" : "bi-chevron"} aria-hidden="true">
                            ›
                          </span>
                        </button>
                        {isOpen && (
                          <div className="bi-rail-links">
                            {datasets.map((d) => (
                              <button
                                key={d.key}
                                type="button"
                                className={`bi-rail-link ${d.key === activeKey ? "is-active" : ""}`}
                                onClick={() => setActiveKey(d.key)}
                                title={d.description || d.label || d.key}
                              >
                                {d.label || humanize(d.key)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>

                {/* ---------------------------------------------- panel */}
                <section className="bi-panel">
                  {!active ? (
                    <div className="empty-state-card">
                      <span className="empty-icon">📊</span>
                      <h3>Pick a dataset</h3>
                      <p>Choose a dataset from the rail to start.</p>
                    </div>
                  ) : (
                    <>
                      {/* ------------------------ what this measures */}
                      <article className="bi-card bi-about">
                        <header className="bi-about-head">
                          <div>
                            <span className="bi-domain-chip">{humanize(active.domain || "other")}</span>
                            <h2>{active.label || humanize(active.key)}</h2>
                          </div>
                          <code className="bi-dataset-key">{active.key}</code>
                        </header>

                        <div className="bi-about-block">
                          <h4>What this measures</h4>
                          <p className="bi-about-desc">
                            {active.description || "This dataset ships no description in /bi/catalog."}
                          </p>
                        </div>

                        {active.note && (
                          <div className="bi-note-card bi-about-note">
                            <strong>Caveat from the catalog:</strong> {active.note}
                          </div>
                        )}

                        {active.defaultFilters && Object.keys(active.defaultFilters).length > 0 && (
                          <p className="bi-default-filter-line">
                            Unless you filter the same dimension, this dataset is queried with{" "}
                            {Object.entries(active.defaultFilters).map(([k, v], i) => (
                              <span key={k}>
                                {i > 0 ? ", " : ""}
                                <code>
                                  {k} = {Array.isArray(v) ? v.join(" | ") : String(v)}
                                </code>
                              </span>
                            ))}
                            .
                          </p>
                        )}

                        <div className="bi-about-grid">
                          <div className="bi-about-block">
                            <h4>Source tables</h4>
                            {active.sourceTables && active.sourceTables.length > 0 ? (
                              <div className="bi-chip-row">
                                {active.sourceTables.map((t) => (
                                  <code key={t} className="bi-source-chip">
                                    {t}
                                  </code>
                                ))}
                              </div>
                            ) : (
                              <p className="bi-muted-line">Not declared by the catalog.</p>
                            )}
                          </div>

                          <div className="bi-about-block">
                            <h4>Dimensions ({dimensions.length})</h4>
                            {dimensions.length > 0 ? (
                              <ul className="bi-def-list">
                                {dimensions.map((d) => (
                                  <li key={d.key}>
                                    <span className="bi-def-label">{d.label || humanize(d.key)}</span>
                                    <code>{d.key}</code>
                                    {d.sqlColumn && <span className="bi-col-chip">{d.sqlColumn}</span>}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="bi-muted-line">This dataset declares no dimensions.</p>
                            )}
                          </div>

                          <div className="bi-about-block">
                            <h4>Measures ({measures.length})</h4>
                            {measures.length > 0 ? (
                              <ul className="bi-def-list">
                                {measures.map((m) => (
                                  <li key={m.key}>
                                    <span className="bi-def-label">{m.label || humanize(m.key)}</span>
                                    <code>{m.key}</code>
                                    {m.unit && <span className="bi-unit-chip">{m.unit}</span>}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="bi-muted-line">This dataset declares no measures.</p>
                            )}
                          </div>
                        </div>

                        {active.delegated && (
                          <p className="bi-perm-line">
                            Aggregated by the existing <code>{active.delegated}</code> calculation rather than the generic
                            SQL engine — the numbers here are the same ones the matching /reporting report produces.
                          </p>
                        )}

                        {active.requiresPermission && (
                          <p className="bi-perm-line">
                            Requires permission <code>{active.requiresPermission}</code>. Rows are scoped to your active
                            outlet server-side.
                          </p>
                        )}
                      </article>

                      {/* ---------------------------------- controls */}
                      <article className="bi-card bi-controls">
                        <div className="bi-control-row">
                          <div className="bi-control">
                            <label className="bi-control-label">Date range</label>
                            <div className="bi-preset-row">
                              {([
                                { id: "today", label: "Today" },
                                { id: "7d", label: "7 days" },
                                { id: "30d", label: "30 days" },
                                { id: "mtd", label: "MTD" },
                                { id: "custom", label: "Custom" },
                              ] as { id: PresetId; label: string }[]).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  className={`bi-preset ${preset === p.id ? "is-active" : ""}`}
                                  onClick={() => applyPreset(p.id)}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <div className="bi-date-row">
                              <input
                                type="date"
                                className="bi-input"
                                value={from}
                                max={to || undefined}
                                aria-label="From date"
                                onChange={(e) => {
                                  setFrom(e.target.value);
                                  setPreset("custom");
                                }}
                              />
                              <span className="bi-date-sep">→</span>
                              <input
                                type="date"
                                className="bi-input"
                                value={to}
                                min={from || undefined}
                                aria-label="To date"
                                onChange={(e) => {
                                  setTo(e.target.value);
                                  setPreset("custom");
                                }}
                              />
                            </div>
                          </div>

                          {grainOptions.length > 0 && (
                            <div className="bi-control">
                              <label className="bi-control-label">
                                Grain <span className="bi-hint">declared by this dataset</span>
                              </label>
                              <div className="bi-preset-row">
                                {grainOptions.map((g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    className={`bi-preset ${grain === g ? "is-active" : ""}`}
                                    onClick={() => applyGrain(g)}
                                  >
                                    {humanize(g)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bi-control-row">
                          <div className="bi-control bi-control-wide">
                            <label className="bi-control-label">
                              Group by <span className="bi-hint">{groupBy.length} of {dimensions.length} dimensions</span>
                            </label>
                            {dimensions.length === 0 ? (
                              <p className="bi-muted-line">No dimensions declared — this dataset returns one summary row.</p>
                            ) : (
                              <div className="bi-check-row">
                                {dimensions.map((d) => (
                                  <label key={d.key} className={`bi-check ${groupBy.includes(d.key) ? "is-on" : ""}`}>
                                    <input
                                      type="checkbox"
                                      checked={groupBy.includes(d.key)}
                                      onChange={() => toggleGroupBy(d.key)}
                                    />
                                    {d.label || humanize(d.key)}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="bi-control bi-control-wide">
                            <label className="bi-control-label">
                              Measures <span className="bi-hint">{selectedMeasures.length} of {measures.length}</span>
                            </label>
                            {measures.length === 0 ? (
                              <p className="bi-muted-line">No measures declared by this dataset.</p>
                            ) : (
                              <div className="bi-check-row">
                                {measures.map((m) => (
                                  <label
                                    key={m.key}
                                    className={`bi-check ${selectedMeasures.includes(m.key) ? "is-on" : ""}`}
                                    title={m.unit ? `Unit: ${m.unit}` : undefined}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedMeasures.includes(m.key)}
                                      onChange={() => toggleMeasure(m.key)}
                                    />
                                    {m.label || humanize(m.key)}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="bi-control-row">
                          <div className="bi-control bi-control-wide">
                            <label className="bi-control-label">Filters</label>
                            <div className="bi-filter-row">
                              {filters.length === 0 && <span className="bi-muted-line">No filters — all rows in range.</span>}
                              {filters.map((f) => (
                                <span key={`${f.dimension}:${f.value}`} className="bi-filter-chip">
                                  <strong>{dimensionLabel(f.dimension)}</strong>
                                  <span>= {f.value}</span>
                                  <button
                                    type="button"
                                    aria-label={`Remove filter ${f.dimension} = ${f.value}`}
                                    onClick={() => setFilters((prev) => prev.filter((x) => x !== f))}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                            {dimensions.length > 0 && (
                              <div className="bi-filter-add">
                                <select
                                  className="bi-input"
                                  value={newFilterDim}
                                  aria-label="Filter dimension"
                                  onChange={(e) => setNewFilterDim(e.target.value)}
                                >
                                  <option value="">Dimension…</option>
                                  {dimensions.map((d) => (
                                    <option key={d.key} value={d.key}>
                                      {d.label || humanize(d.key)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="bi-input"
                                  placeholder="equals value"
                                  value={newFilterValue}
                                  aria-label="Filter value"
                                  onChange={(e) => setNewFilterValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") addFilter();
                                  }}
                                />
                                <button type="button" className="bi-btn-ghost" onClick={addFilter}>
                                  Add filter
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="bi-control bi-run-control">
                            <button type="button" className="bi-btn-primary" onClick={runQuery} disabled={queryLoading}>
                              {queryLoading ? "Running…" : "Run query"}
                            </button>
                            <button
                              type="button"
                              className="bi-btn-ghost"
                              onClick={exportCsv}
                              disabled={sortedRows.length === 0}
                              title={sortedRows.length === 0 ? "Run a query with rows first" : "Download the loaded rows as CSV"}
                            >
                              Export CSV
                            </button>
                          </div>
                        </div>
                      </article>

                      {/* ------------------------------------ results */}
                      {queryError ? (
                        <div className="bi-error-card">
                          <h3>Query failed</h3>
                          <p className="bi-error-message">{queryError}</p>
                          <p className="bi-error-hint">No rows are rendered — this is the API&apos;s real error, unedited.</p>
                        </div>
                      ) : (
                        <>
                          {result?.note && (
                            <div className="bi-note-card">
                              <strong>Note from the API:</strong> {result.note}
                            </div>
                          )}

                          <article className="bi-card">
                            <header className="bi-section-head">
                              <div>
                                <h3>Chart</h3>
                                <p className="bi-section-sub">
                                  {chartMeasureKeys.length > 0
                                    ? `${chartMeasureKeys.map(measureLabel).join(", ")} by ${
                                        responseGroupBy.length > 0 ? responseGroupBy.map(dimensionLabel).join(" · ") : "the whole range"
                                      }`
                                    : "Select a measure to plot."}
                                </p>
                              </div>
                              <div className="bi-chart-tools">
                                <select
                                  className="bi-input"
                                  aria-label="Charted measure"
                                  value={chartMeasure || responseMeasures[0] || ""}
                                  onChange={(e) => setChartMeasure(e.target.value)}
                                >
                                  {responseMeasures.map((k) => (
                                    <option key={k} value={k}>
                                      {measureLabel(k)}
                                    </option>
                                  ))}
                                </select>
                                {overlayCandidates > 1 && (
                                  <label className="bi-check bi-check-inline">
                                    <input type="checkbox" checked={overlay} onChange={() => setOverlay((v) => !v)} />
                                    Overlay same-unit measures
                                  </label>
                                )}
                                <div className="bi-preset-row">
                                  {(["bar", "line", "donut"] as ChartKind[]).map((k) => (
                                    <button
                                      key={k}
                                      type="button"
                                      className={`bi-preset ${chartKind === k ? "is-active" : ""}`}
                                      disabled={k === "donut" && !donutAvailable}
                                      title={
                                        k === "donut" && !donutAvailable
                                          ? "A share-of-total donut needs a grouped result with 24 rows or fewer"
                                          : undefined
                                      }
                                      onClick={() => setChartKind(k)}
                                    >
                                      {humanize(k)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </header>

                            {chartKind === "line" ? (
                              <MultiSeriesLineChart
                                points={chartData}
                                series={chartSeries}
                                loading={queryLoading}
                                height={260}
                                emptyMessage="No data in this range."
                                valueFormatter={chartValueFormatter}
                                ariaLabel={`${chartMeasureKeys.map(measureLabel).join(", ")} trend`}
                                onPointClick={(i) => {
                                  const row = sortedRows[i];
                                  if (row) openDrilldown(row);
                                }}
                              />
                            ) : chartKind === "donut" ? (
                              <DonutChart
                                slices={donutSlices}
                                size={200}
                                loading={queryLoading}
                                emptyMessage="No data in this range."
                                valueFormatter={(v) => chartValueFormatter(v, chartMeasureKeys[0] || "")}
                                ariaLabel={`Share of ${measureLabel(chartMeasureKeys[0] || "")}`}
                              />
                            ) : (
                              <BarChart
                                categories={chartData}
                                series={chartSeries}
                                orientation={responseGroupBy.length === 0 || sortedRows.length > 8 ? "horizontal" : "vertical"}
                                height={280}
                                loading={queryLoading}
                                emptyMessage="No data in this range."
                                valueFormatter={chartValueFormatter}
                                ariaLabel={`${chartMeasureKeys.map(measureLabel).join(", ")} by ${responseGroupBy
                                  .map(dimensionLabel)
                                  .join(", ")}`}
                                onCategoryClick={(i) => {
                                  const row = sortedRows[i];
                                  if (row) openDrilldown(row);
                                }}
                              />
                            )}
                          </article>

                          <article className="bi-card">
                            <header className="bi-section-head">
                              <div>
                                <h3>Rows</h3>
                                <p className="bi-section-sub">
                                  {queryLoading
                                    ? "Running GET /bi/query…"
                                    : `${sortedRows.length.toLocaleString("en-IN")} row${sortedRows.length === 1 ? "" : "s"}${
                                        typeof result?.rowCount === "number" && result.rowCount !== sortedRows.length
                                          ? ` of ${result.rowCount.toLocaleString("en-IN")}`
                                          : ""
                                      }${result?.generatedAt ? ` · generated ${new Date(result.generatedAt).toLocaleString("en-IN")}` : ""}`}
                                </p>
                              </div>
                            </header>

                            {result?.truncated && (
                              <p className="bi-truncated-line">
                                The server capped this result. Sorting the table below reorders only the rows already
                                loaded — press <strong>Run query</strong> to re-query with the current sort applied
                                server-side.
                              </p>
                            )}

                            {queryLoading ? (
                              <div className="bi-table-state">Loading rows…</div>
                            ) : !hasRun ? (
                              <div className="bi-table-state">Press &quot;Run query&quot; to load rows.</div>
                            ) : sortedRows.length === 0 ? (
                              <div className="bi-table-state">
                                No data in this range{filters.length > 0 ? " with the active filters" : ""}.
                              </div>
                            ) : (
                              <div className="bi-table-scroll">
                                <table className="bi-table">
                                  <thead>
                                    <tr>
                                      {responseGroupBy.map((g) => (
                                        <th key={g} scope="col">
                                          <button type="button" className="bi-sort-btn" onClick={() => toggleSort(g)}>
                                            {dimensionLabel(g)}
                                            {sortKey === g && <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
                                          </button>
                                        </th>
                                      ))}
                                      {responseMeasures.map((k) => (
                                        <th key={k} scope="col" className="is-numeric">
                                          <button type="button" className="bi-sort-btn" onClick={() => toggleSort(k)}>
                                            {measureLabel(k)}
                                            {sortKey === k && <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
                                          </button>
                                        </th>
                                      ))}
                                      <th scope="col" className="is-action">
                                        Records
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sortedRows.map((row, i) => (
                                      <tr key={`${rowLabel(row)}-${i}`}>
                                        {responseGroupBy.map((g) => (
                                          <td key={g}>
                                            <button
                                              type="button"
                                              className="bi-cell-filter"
                                              title={`Filter ${dimensionLabel(g)} = ${dimensionText(row[g])}`}
                                              onClick={() => addFilterFromCell(g, row[g])}
                                            >
                                              {dimensionText(row[g])}
                                            </button>
                                          </td>
                                        ))}
                                        {responseMeasures.map((k) => (
                                          <td key={k} className="is-numeric">
                                            {formatMeasure(row[k], measureByKey.get(k))}
                                          </td>
                                        ))}
                                        <td className="is-action">
                                          <button type="button" className="bi-drill-btn" onClick={() => openDrilldown(row)}>
                                            Drill through
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  {isPlainObject(result?.totals) && (
                                    <tfoot>
                                      <tr>
                                        {responseGroupBy.map((g, i) => (
                                          <td key={g}>{i === 0 ? "Total" : ""}</td>
                                        ))}
                                        {responseGroupBy.length === 0 && <td>Total</td>}
                                        {responseMeasures.map((k) => (
                                          <td key={k} className="is-numeric">
                                            {formatMeasure((result!.totals as Record<string, unknown>)[k], measureByKey.get(k))}
                                          </td>
                                        ))}
                                        <td className="is-action" />
                                      </tr>
                                    </tfoot>
                                  )}
                                </table>
                              </div>
                            )}
                          </article>
                        </>
                      )}
                    </>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ------------------------------------------------ drill-through */}
      {drillOpen && (
        <div className="bi-drawer-backdrop" role="presentation" onClick={() => setDrillOpen(false)}>
          <aside
            className="bi-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Underlying records"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="bi-drawer-head">
              <div>
                <span className="bi-drawer-eyebrow">Underlying records</span>
                <h3>{drillTitle || "Selected row"}</h3>
                <p className="bi-drawer-sub">
                  GET /bi/drilldown · {active?.label || active?.key} · {from} → {to}
                </p>
              </div>
              <button type="button" className="bi-drawer-close" aria-label="Close" onClick={() => setDrillOpen(false)}>
                ×
              </button>
            </header>

            <div className="bi-drawer-body">
              {drillLoading ? (
                <div className="bi-table-state">Loading the raw records behind this row…</div>
              ) : drillError ? (
                <div className="bi-error-card">
                  <h3>Drill-through failed</h3>
                  <p className="bi-error-message">{drillError}</p>
                </div>
              ) : drillRows.length === 0 ? (
                <div className="bi-table-state">No underlying records returned for this row.</div>
              ) : (
                <>
                  <p className="bi-drawer-count">
                    {drillRows.length.toLocaleString("en-IN")} record{drillRows.length === 1 ? "" : "s"}
                    {drillRows.length >= 500 ? " — the API caps drill-through at 500 records, so this may be a partial view." : ""}
                  </p>
                  <div className="bi-table-scroll">
                    <table className="bi-table">
                      <thead>
                        <tr>
                          {drillColumns.map((c) => (
                            <th key={c} scope="col">
                              {humanize(c)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drillRows.map((r, i) => (
                          <tr key={i}>
                            {drillColumns.map((c) => (
                              <td key={c}>
                                {/minor$/i.test(c) && /^-?\d+$/.test(String(r[c] ?? ""))
                                  ? `₹${Number(minorToMajorString(r[c])).toLocaleString("en-IN", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}`
                                  : dimensionText(r[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      <style jsx global>{`
        .bi-app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background-color: var(--bg-base);
          color: var(--text-primary);
        }
        .dashboard-body {
          padding: 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 1600px;
          margin: 0 auto;
          width: 100%;
        }
        .dashboard-greeting-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
        .breadcrumb-line { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; }
        .greeting-title { margin: 4px 0 2px 0; font-size: 1.75rem; font-weight: 800; letter-spacing: -0.5px; }
        .greeting-subtitle { margin: 0; font-size: 0.875rem; color: var(--text-secondary); max-width: 720px; }
        .bi-ghost-link { font-size: 0.8125rem; font-weight: 700; color: var(--accent); text-decoration: none; }
        .bi-ghost-link:hover { text-decoration: underline; }

        .bi-layout { display: grid; grid-template-columns: 250px 1fr; gap: 20px; align-items: start; }

        .bi-rail {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 8px;
          position: sticky;
          top: 24px;
          max-height: calc(100vh - 48px);
          overflow-y: auto;
        }
        .bi-rail-group { margin-bottom: 2px; }
        .bi-rail-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 10px;
          border: none;
          background: transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--text-secondary);
          text-align: left;
        }
        .bi-rail-header:hover { background: var(--bg-subtle); }
        .bi-rail-header > span:first-child { flex: 1; }
        .bi-rail-count {
          font-size: 0.6875rem;
          background: var(--bg-subtle);
          border-radius: var(--radius-pill);
          padding: 1px 7px;
          color: var(--text-muted);
        }
        .bi-chevron { transition: transform 0.15s ease; display: inline-block; }
        .bi-chevron.is-open { transform: rotate(90deg); }
        .bi-rail-links { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 6px 0; }
        .bi-rail-link {
          text-align: left;
          padding: 8px 10px 8px 18px;
          border: none;
          background: transparent;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .bi-rail-link:hover { background: var(--bg-subtle); }
        .bi-rail-link.is-active { background: var(--accent-subtle); color: var(--accent-subtle-text); }

        .bi-panel { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
        .bi-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 18px;
        }

        .bi-about-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
        .bi-about-head h2 { margin: 6px 0 0 0; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.3px; }
        .bi-domain-chip {
          font-size: 0.6875rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-subtle-text);
          background: var(--accent-subtle);
          border-radius: var(--radius-pill);
          padding: 3px 9px;
        }
        .bi-dataset-key { font-size: 0.6875rem; color: var(--text-muted); background: var(--bg-subtle); padding: 3px 8px; border-radius: var(--radius-sm); }
        .bi-about-block { min-width: 0; }
        .bi-about-block h4 {
          margin: 0 0 6px 0;
          font-size: 0.6875rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .bi-about-desc { margin: 0 0 14px 0; font-size: 0.875rem; line-height: 1.55; color: var(--text-secondary); max-width: 900px; }
        .bi-about-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; }
        .bi-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .bi-source-chip {
          font-size: 0.6875rem;
          background: var(--bg-subtle);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          padding: 3px 8px;
          color: var(--text-secondary);
        }
        .bi-def-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
        .bi-def-list li { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.75rem; }
        .bi-def-label { font-weight: 700; color: var(--text-primary); }
        .bi-def-list code { font-size: 0.6875rem; color: var(--text-muted); }
        .bi-unit-chip {
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          background: var(--blue-subtle);
          color: var(--blue-text);
          border-radius: var(--radius-pill);
          padding: 1px 6px;
        }
        .bi-about-note { margin: 0 0 14px 0; }
        .bi-default-filter-line { margin: 0 0 14px 0; font-size: 0.75rem; color: var(--text-secondary); }
        .bi-default-filter-line code { background: var(--bg-subtle); padding: 1px 5px; border-radius: 4px; }
        .bi-col-chip { font-size: 0.625rem; color: var(--text-muted); background: var(--bg-subtle); border-radius: 4px; padding: 1px 5px; }
        .bi-perm-line { margin: 14px 0 0 0; font-size: 0.75rem; color: var(--text-muted); }
        .bi-perm-line code { background: var(--bg-subtle); padding: 1px 5px; border-radius: 4px; }
        .bi-muted-line { margin: 0; font-size: 0.75rem; color: var(--text-muted); }

        .bi-controls { display: flex; flex-direction: column; gap: 16px; }
        .bi-control-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
        .bi-control { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
        .bi-control-wide { flex: 1; min-width: 280px; }
        .bi-run-control { flex-direction: row; align-items: flex-end; gap: 8px; margin-left: auto; }
        .bi-control-label {
          font-size: 0.6875rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .bi-hint { font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--text-muted); opacity: 0.85; }
        .bi-preset-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .bi-preset {
          border: 1px solid var(--border);
          background: var(--bg-card);
          border-radius: var(--radius-pill);
          padding: 5px 12px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .bi-preset:hover:not(:disabled) { background: var(--bg-subtle); }
        .bi-preset.is-active { background: var(--accent-subtle); border-color: var(--accent); color: var(--accent-subtle-text); }
        .bi-preset:disabled { opacity: 0.45; cursor: not-allowed; }
        .bi-date-row { display: flex; align-items: center; gap: 8px; }
        .bi-date-sep { color: var(--text-muted); font-size: 0.75rem; }
        .bi-input {
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 6px 9px;
          font-size: 0.8125rem;
          font-family: inherit;
          color: var(--text-primary);
          background: var(--bg-card);
          min-width: 0;
        }
        .bi-input:focus { outline: 2px solid var(--accent-glow); border-color: var(--accent); }
        .bi-check-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .bi-check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          padding: 5px 11px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          background: var(--bg-card);
        }
        .bi-check.is-on { background: var(--accent-subtle); border-color: var(--accent); color: var(--accent-subtle-text); }
        .bi-check input { accent-color: var(--accent); margin: 0; }
        .bi-check-inline { white-space: nowrap; }
        .bi-filter-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 26px; }
        .bi-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--blue-subtle);
          color: var(--blue-text);
          border-radius: var(--radius-pill);
          padding: 4px 6px 4px 11px;
          font-size: 0.75rem;
        }
        .bi-filter-chip button {
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          padding: 0 3px;
        }
        .bi-filter-add { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
        .bi-btn-primary {
          background: var(--accent);
          color: #fff;
          border: none;
          border-radius: var(--radius-btn);
          padding: 9px 18px;
          font-size: 0.8125rem;
          font-weight: 800;
          cursor: pointer;
        }
        .bi-btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
        .bi-btn-primary:disabled { opacity: 0.6; cursor: wait; }
        .bi-btn-ghost {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-btn);
          padding: 9px 16px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--text-primary);
          cursor: pointer;
        }
        .bi-btn-ghost:hover:not(:disabled) { background: var(--bg-subtle); }
        .bi-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

        .bi-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
        .bi-section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
        .bi-section-sub { margin: 3px 0 0 0; font-size: 0.75rem; color: var(--text-secondary); }
        .bi-chart-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

        .bi-note-card {
          background: var(--warning-subtle);
          border: 1px solid var(--warning);
          color: var(--warning-text);
          border-radius: var(--radius-md);
          padding: 10px 14px;
          font-size: 0.8125rem;
        }
        .bi-error-card {
          background: var(--destructive-subtle);
          border: 1px solid var(--destructive);
          border-radius: var(--radius-lg);
          padding: 16px 18px;
        }
        .bi-error-card h3 { margin: 0 0 6px 0; font-size: 0.9375rem; font-weight: 800; color: var(--destructive-text); }
        .bi-error-message { margin: 0; font-size: 0.8125rem; color: var(--destructive-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-word; }
        .bi-error-hint { margin: 8px 0 0 0; font-size: 0.75rem; color: var(--text-secondary); }
        .bi-truncated-line { margin: 0 0 10px 0; font-size: 0.75rem; color: var(--warning-text); background: var(--warning-subtle); border-radius: var(--radius-sm); padding: 7px 10px; }

        .bi-table-state { padding: 34px 12px; text-align: center; font-size: 0.8125rem; color: var(--text-muted); }
        .bi-table-scroll { overflow-x: auto; }
        .bi-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .bi-table th, .bi-table td { padding: 9px 12px; text-align: left; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
        .bi-table thead th { position: sticky; top: 0; background: var(--bg-subtle); font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 800; z-index: 1; }
        .bi-table td.is-numeric, .bi-table th.is-numeric { text-align: right; font-variant-numeric: tabular-nums; }
        .bi-table th.is-action, .bi-table td.is-action { text-align: right; }
        .bi-table tbody tr:hover { background: var(--bg-subtle); }
        .bi-table tfoot td { font-weight: 800; background: var(--bg-subtle); border-top: 2px solid var(--border); border-bottom: none; }
        .bi-sort-btn {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: inherit;
          text-transform: inherit;
          letter-spacing: inherit;
          cursor: pointer;
        }
        .bi-sort-btn:hover { color: var(--text-primary); }
        .bi-cell-filter {
          background: none;
          border: none;
          padding: 0;
          font: inherit;
          color: var(--text-primary);
          cursor: pointer;
          text-align: left;
          border-bottom: 1px dotted var(--border);
        }
        .bi-cell-filter:hover { color: var(--accent); border-bottom-color: var(--accent); }
        .bi-drill-btn {
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          border-radius: var(--radius-pill);
          padding: 3px 11px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .bi-drill-btn:hover { background: var(--accent-subtle); border-color: var(--accent); color: var(--accent-subtle-text); }

        .bi-drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(9, 9, 11, 0.42);
          display: flex;
          justify-content: flex-end;
          z-index: 60;
        }
        .bi-drawer {
          background: var(--bg-card);
          width: min(920px, 96vw);
          height: 100%;
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-modal);
        }
        .bi-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
        .bi-drawer-eyebrow { font-size: 0.6875rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
        .bi-drawer-head h3 { margin: 5px 0 2px 0; font-size: 1.0625rem; font-weight: 800; }
        .bi-drawer-sub { margin: 0; font-size: 0.75rem; color: var(--text-muted); }
        .bi-drawer-close { border: none; background: var(--bg-subtle); border-radius: var(--radius-pill); width: 30px; height: 30px; font-size: 1.125rem; line-height: 1; cursor: pointer; color: var(--text-secondary); flex-shrink: 0; }
        .bi-drawer-close:hover { background: var(--bg-hover); }
        .bi-drawer-body { padding: 16px 20px 24px 20px; overflow: auto; flex: 1; }
        .bi-drawer-count { margin: 0 0 10px 0; font-size: 0.75rem; color: var(--text-secondary); }

        .empty-state-card { text-align: center; padding: 60px 20px; background: var(--bg-card); border: 1px dashed var(--border); border-radius: var(--radius-lg); }
        .empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }
        .empty-state-card h3 { margin: 0 0 6px 0; font-size: 1.0625rem; font-weight: 800; }
        .empty-state-card p { margin: 0; font-size: 0.8125rem; color: var(--text-secondary); }

        @media (max-width: 980px) {
          .bi-layout { grid-template-columns: 1fr; }
          .bi-rail { position: static; max-height: none; }
          .dashboard-body { padding: 20px 16px; }
        }
      `}</style>
    </div>
  );
}
