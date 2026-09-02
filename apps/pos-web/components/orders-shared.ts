// Shared formatting + normalisation helpers for the four Orders screens
// (Live Orders, All Orders, Advance Order, Online Orders).
//
// Money crosses the wire as BigInt serialised to a STRING in minor units.
// Never parse it with parseInt on a raw object — always go through
// `minorToMajor` so a null / undefined / "" degrades to 0 rather than NaN.

export function minorToMajor(minor: string | number | null | undefined): number {
  if (minor === null || minor === undefined || minor === "") return 0;
  const n = typeof minor === "number" ? minor : Number(minor);
  return Number.isFinite(n) ? n / 100 : 0;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(value: number): string {
  return `₹${formatMoney(value)}`;
}

export function formatMinor(minor: string | number | null | undefined): string {
  return formatMoney(minorToMajor(minor));
}

/** "2026-09-02 14:03:21" in the viewer's local time, never UTC-shifted. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatTimeOnly(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "02 Sep" — the x-axis label the trend charts use. */
export function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** `<input type="date">` value for a Date. */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Turns SNAKE_CASE status / order-type codes into "Snake Case" for display. */
export function humanizeCode(code: string | null | undefined): string {
  if (!code) return "";
  return String(code)
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type BadgeTone = "neutral" | "accent" | "warning" | "danger" | "info" | "purple";

/** Maps a raw order status onto one of the token palettes in `_app.tsx`. */
export function statusTone(status: string | null | undefined): BadgeTone {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED" || s === "SETTLED" || s === "PAID" || s === "DELIVERED") return "accent";
  if (s === "CANCELLED" || s === "VOIDED" || s === "REJECTED" || s === "FAILED") return "danger";
  if (s === "READY" || s === "FOOD_READY") return "info";
  if (s === "OUT_FOR_DELIVERY" || s === "DISPATCHED" || s === "HANDED_OVER" || s === "ASSIGNED")
    return "purple";
  if (s === "DRAFT" || s === "PLACED") return "neutral";
  return "warning";
}

/** Escapes one CSV field (RFC 4180). */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Builds a CSV from headers + rows and hands it to the browser as a download.
 * Excel opens CSV natively; the BOM keeps ₹ and non-ASCII names intact.
 */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  if (typeof window === "undefined") return;
  const body = [headers, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n");
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
