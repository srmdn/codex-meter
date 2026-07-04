import type { CacheMeta } from "./cache.js";
import { availableCredits, codexAvailableCredits, type ResetCredit, type ResetCreditsResponse } from "./reset-credits.js";
import type { NormalizedRateLimitWindow, UsageSnapshot } from "./app-server.js";

export type JsonOutput = {
  timezone: string;
  cache: {
    hit: boolean;
    age_seconds: number;
  };
  rate_limits: null | {
    plan_type: string | null;
    limit_id: string | null;
    windows: Record<string, JsonRateLimitWindow>;
    five_hour?: JsonRateLimitWindow;
    weekly?: JsonRateLimitWindow;
  };
  reset_credits: {
    available_count: number;
    next_expires_at: string | null;
    next_expires_at_local: string | null;
    credits: Array<{
      status?: string;
      reset_type?: string;
      title?: string;
      expires_at?: string;
      expires_at_local: string | null;
      timezone: string;
    }>;
  };
};

type JsonRateLimitWindow = {
  label: string;
  used_percent: number;
  remaining_percent: number;
  resets_at: number | null;
  resets_at_local: string | null;
  window_duration_mins: number | null;
};

export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("timezone: invalid IANA timezone");
  }
}

export function formatLocal(value: string | number | Date | undefined, timezone: string): string | null {
  if (value === undefined) return null;
  const date = coerceDate(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatLocalPrecise(value: string | undefined, timezone: string): string | null {
  if (!value) return null;
  const local = formatLocal(value, timezone);
  if (!local) return null;
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})?$/)?.[1];
  return fraction ? `${local}.${fraction}` : local;
}

export function timezoneAbbreviation(timezone: string, date = new Date()): string {
  const known = timezoneAbbreviationMap[timezone];
  if (known) return known;
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  return part && !part.startsWith("GMT") ? part : timezone;
}

export function timezoneOffset(timezone: string, date = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" })
    .formatToParts(date)
    .find((item) => item.type === "timeZoneName")?.value;
  if (!part || part === "GMT") return "UTC+00:00";
  const match = part.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return part.replace("GMT", "UTC");
  const [, sign, hours, minutes = "00"] = match;
  return `UTC${sign}${hours.padStart(2, "0")}:${minutes}`;
}

export function timezoneLabel(timezone: string, date = new Date()): string {
  return `${timezone} (${timezoneAbbreviation(timezone, date)}, ${timezoneOffset(timezone, date)})`;
}

const timezoneAbbreviationMap: Record<string, string> = {
  "Asia/Jakarta": "WIB",
  "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT"
};

export function coerceDate(value: string | number | Date): Date {
  if (typeof value === "number" && value > 0 && value < 1000000000000) {
    return new Date(value * 1000);
  }
  return new Date(value);
}

export function formatShort(value: string | undefined, timezone: string): string {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")} ${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatDurationUntil(value: string | undefined): string {
  if (!value) return "unknown";
  const ms = Date.parse(value) - Date.now();
  if (!Number.isFinite(ms)) return "unknown";
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatDurationUntilTime(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "unknown";
  const date = coerceDate(value);
  const ms = date.getTime() - Date.now();
  if (!Number.isFinite(ms)) return "unknown";
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatDefault(data: ResetCreditsResponse, timezone: string, usage: UsageSnapshot | null = null): string {
  const next = codexAvailableCredits(data)[0];
  const nextText = next ? `next expires ${formatShort(next.expires_at, timezone)} ${timezoneAbbreviation(timezone, next.expires_at ? new Date(next.expires_at) : new Date())}` : "none expiring";
  const usageText = usage && usage.windows.length > 0 ? formatUsageInline(usage, timezone) : "usage: unavailable (app-server did not respond in time; run `codex-meter` again)";
  return `◆ Codex${formatPlanSuffix(usage)}\n${usageText} │ resets: ${data.available_count}, ${nextText}`;
}

export function formatUsage(usage: UsageSnapshot | null, timezone: string): string {
  if (!usage || usage.windows.length === 0) {
    return "usage: unavailable from app-server (did not respond in time; run `codex-meter usage` again)";
  }
  const lines = [`Timezone: ${timezoneLabel(timezone)}`];
  for (const window of usage.windows) {
    lines.push(formatWindow(window, timezone));
  }
  if (usage.resetCreditsAvailableCount !== null) {
    lines.push(`available reset credits: ${usage.resetCreditsAvailableCount}`);
  }
  return lines.join("\n");
}

export function formatUsageInline(usage: UsageSnapshot, timezone: string): string {
  return usage.windows.map((window) => formatWindow(window, timezone)).join(" │ ");
}

export function formatWindow(window: NormalizedRateLimitWindow, timezone: string): string {
  const reset = window.resetsAt ? `${formatShortTime(window.resetsAt, timezone)} (${formatDurationUntilTime(window.resetsAt)})` : "unknown";
  return `${window.label}: ${bar(window.remainingPercent)} ${window.remainingPercent}% left, resets ${reset}`;
}

function formatPlanSuffix(usage: UsageSnapshot | null): string {
  if (!usage?.planType) return "";
  return ` │ ${capitalize(usage.planType)}`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function formatShortTime(value: number, timezone: string): string {
  const date = coerceDate(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")} ${get("day")} ${get("hour")}:${get("minute")}`;
}

function bar(percent: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(percent / 20)));
  return `${"▰".repeat(filled)}${"▱".repeat(5 - filled)}`;
}

export function formatResets(data: ResetCreditsResponse, timezone: string): string {
  const credits = availableCredits(data);
  const lines = [`Local timezone: ${timezoneLabel(timezone)}`, `Reset credits: ${data.available_count} available`];
  if (credits.length === 0) {
    lines.push("No available reset credits.");
    return lines.join("\n");
  }
  for (const credit of credits) {
    lines.push(formatCreditLine(credit, timezone));
  }
  return lines.join("\n");
}

export function formatCreditLine(credit: ResetCredit, timezone: string): string {
  const local = formatLocalPrecise(credit.expires_at, timezone) ?? "unknown";
  const abbreviation = timezoneAbbreviation(timezone, credit.expires_at ? new Date(credit.expires_at) : new Date());
  return `- ${local} ${abbreviation}`;
}

export function toJsonOutput(data: ResetCreditsResponse, timezone: string, cache: CacheMeta, usage: UsageSnapshot | null = null): JsonOutput {
  const next = codexAvailableCredits(data)[0];
  return {
    timezone,
    cache: {
      hit: cache.hit,
      age_seconds: cache.ageSeconds
    },
    rate_limits: usage ? toJsonRateLimits(usage, timezone) : null,
    reset_credits: {
      available_count: data.available_count,
      next_expires_at: next?.expires_at ?? null,
      next_expires_at_local: formatLocal(next?.expires_at, timezone),
      credits: availableCredits(data).map((credit) => ({
        status: credit.status,
        reset_type: credit.reset_type,
        title: credit.title,
        expires_at: credit.expires_at,
        expires_at_local: formatLocal(credit.expires_at, timezone),
        timezone
      }))
    }
  };
}

function toJsonRateLimits(usage: UsageSnapshot, timezone: string): NonNullable<JsonOutput["rate_limits"]> {
  const windows = Object.fromEntries(usage.windows.map((window) => [window.key, toJsonWindow(window, timezone)]));
  return {
    plan_type: usage.planType,
    limit_id: usage.limitId,
    windows,
    five_hour: windows.five_hour,
    weekly: windows.weekly
  };
}

function toJsonWindow(window: NormalizedRateLimitWindow, timezone: string): JsonRateLimitWindow {
  return {
    label: window.label,
    used_percent: window.usedPercent,
    remaining_percent: window.remainingPercent,
    resets_at: window.resetsAt,
    resets_at_local: formatLocal(window.resetsAt ?? undefined, timezone),
    window_duration_mins: window.windowDurationMins
  };
}
