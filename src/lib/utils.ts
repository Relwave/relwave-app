import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format an ISO timestamp string to a readable local date/time.
 * e.g. "2026-06-12T12:46:20.671Z" → "12 Jun 2026, 12:46 pm"
 */
export function formatTimestamp(dateString?: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Show relative time for recent events, fall back to formatTimestamp for older ones.
 * e.g. "5m ago", "2h ago", "3d ago", or "12 Jun 2026, 12:46 pm"
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatTimestamp(dateString);
}

export function formatDbType(databaseType?: string) {
    if (!databaseType) return "Database";
    if (databaseType === "postgres" || databaseType === "postgresql") return "PostgreSQL";
    if (databaseType === "mysql") return "MySQL";
    if (databaseType === "mariadb") return "MariaDB";
    return databaseType;
}
export function formatDuration(seconds: number) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${minutes}m ${remaining}s`;
}

export function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

