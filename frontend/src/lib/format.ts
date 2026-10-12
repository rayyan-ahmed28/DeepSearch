/** mm:ss */
export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "10 Apr 2026" from an ISO date, independent of the viewer's time zone. */
export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "10 Apr" for chart axes. */
export function formatShortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * A claim's structured value, e.g. "-8.6%" or "1.20 billion USD". Percentage
 * changes get a sign; levels such as volatility ("vol_…") do not.
 */
export function formatClaimValue(value: number, unit?: string | null, calculationId?: string | null): string {
  const isLevel = !!calculationId && !calculationId.startsWith("ret_");
  if (unit === "%") return `${value > 0 && !isLevel ? "+" : ""}${value.toFixed(1)}%`;
  if (unit === "USD" && Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)} billion USD`;
  if (unit === "USD" && Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)} million USD`;
  return `${value.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
}

/** A stored calculation, formatted exactly as the backend fills report placeholders. */
export function formatCalculation(result: number | Record<string, unknown>, unit?: string | null): string {
  if (typeof result !== "number") return "[see data]";
  if (unit === "%") return `${result.toFixed(1)}%`;
  const n = result.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}

/** A source URL that is safe to use as a link (http or https only), else null. */
export function safeHref(url: string | null | undefined): string | null {
  return url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** "5m ago" style, for run lists. */
export function formatAgo(epochMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - epochMs) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "13 Oct 2026, 02:11" in the viewer's own time zone, for when something happened (not a data date). */
export function formatLocalDateTime(when: string | number, withTime = true): string {
  const d = new Date(when);
  const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return withTime ? `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : day;
}
