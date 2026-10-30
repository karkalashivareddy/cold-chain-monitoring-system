import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import type { Numeric, RiskBand, Severity } from "./types";

export function toNumber(value: Numeric | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function fmtTemp(value: Numeric | null | undefined, digits = 1): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return `${n.toFixed(digits)} °C`;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export function fmtPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy");
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  if (isToday(date)) return `Today, ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, "HH:mm")}`;
  return format(date, "d MMM yyyy, HH:mm");
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "HH:mm:ss");
}

export function fmtRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDistanceToNowStrict(date)} ago`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.round(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

export function severityTone(severity: Severity | string): Tone {
  switch (severity) {
    case "CRITICAL":
      return "danger";
    case "WARNING":
      return "warning";
    case "INFO":
      return "info";
    default:
      return "neutral";
  }
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "ONLINE":
    case "OPERATIONAL":
    case "DELIVERED":
    case "RESOLVED":
    case "AVAILABLE":
    case "CLOSED":
      return "success";
    case "DISPATCHED":
    case "IN_TRANSIT":
    case "ACKNOWLEDGED":
      return "info";
    case "PLANNED":
    case "DRAFT":
    case "QUARANTINE":
    case "MAINTENANCE":
    case "WARNING":
      return "warning";
    case "DELAYED":
    case "CRITICAL":
    case "OPEN":
    case "EXPIRED":
    case "RECALLED":
    case "OFFLINE":
    case "REVOKED":
      return "danger";
    case "RESERVED":
    case "INVESTIGATING":
      return "violet";
    default:
      return "neutral";
  }
}

export function riskTone(score: number): Tone {
  if (score >= 75) return "danger";
  if (score >= 50) return "warning";
  if (score >= 25) return "info";
  return "success";
}

export function riskBandTone(band: RiskBand): Tone {
  switch (band) {
    case "SEVERE":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "info";
    default:
      return "success";
  }
}

export function compactId(value: string | null | undefined, length = 8): string {
  if (!value) return "—";
  return value.length <= length ? value : value.slice(-length).toUpperCase();
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.ceil(diff / 86_400_000);
}
