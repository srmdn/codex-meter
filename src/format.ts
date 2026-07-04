import type { CacheMeta } from "./cache.js";
import { availableCredits, codexAvailableCredits, type ResetCredit, type ResetCreditsResponse } from "./reset-credits.js";

export type JsonOutput = {
  timezone: string;
  cache: {
    hit: boolean;
    age_seconds: number;
  };
  rate_limits: null;
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
  const date = new Date(value);
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

export function formatDefault(data: ResetCreditsResponse, timezone: string): string {
  const next = codexAvailableCredits(data)[0];
  const nextText = next ? `next expires ${formatShort(next.expires_at, timezone)}` : "none expiring";
  return `◆ Codex\nusage: unavailable │ resets: ${data.available_count}, ${nextText}`;
}

export function formatResets(data: ResetCreditsResponse, timezone: string): string {
  const credits = availableCredits(data);
  const lines = [`Reset credits: ${data.available_count} available`];
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
  const title = credit.title ?? "Reset credit";
  const local = formatLocal(credit.expires_at, timezone) ?? "unknown";
  const distance = formatDurationUntil(credit.expires_at);
  return `${title}: expires ${local} ${timezone} │ in ${distance}`;
}

export function toJsonOutput(data: ResetCreditsResponse, timezone: string, cache: CacheMeta): JsonOutput {
  const next = codexAvailableCredits(data)[0];
  return {
    timezone,
    cache: {
      hit: cache.hit,
      age_seconds: cache.ageSeconds
    },
    rate_limits: null,
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
