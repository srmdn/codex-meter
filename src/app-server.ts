import { spawn } from "node:child_process";
import { SafeError, toSafeError } from "./errors.js";

export type RateLimitWindow = {
  usedPercent: number;
  resetsAt: number | null;
  windowDurationMins: number | null;
};

export type RateLimitSnapshot = {
  limitId?: string | null;
  limitName?: string | null;
  planType?: string | null;
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
};

export type AppServerRateLimitsResponse = {
  rateLimitResetCredits?: {
    availableCount: number;
  } | null;
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, RateLimitSnapshot> | null;
};

export type NormalizedRateLimitWindow = {
  key: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
  windowDurationMins: number | null;
};

export type UsageSnapshot = {
  planType: string | null;
  limitId: string | null;
  resetCreditsAvailableCount: number | null;
  windows: NormalizedRateLimitWindow[];
};

type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

export async function readUsageSnapshot(options: { timeoutMs?: number } = {}): Promise<UsageSnapshot> {
  const response = await requestRateLimitsWithRetry(options);
  return normalizeRateLimits(response);
}

async function requestRateLimitsWithRetry(options: { timeoutMs?: number }): Promise<AppServerRateLimitsResponse> {
  try {
    return await requestRateLimits(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("timeout") && !message.includes("unavailable")) throw error;
    return requestRateLimits(options);
  }
}

export function normalizeRateLimits(response: AppServerRateLimitsResponse): UsageSnapshot {
  const snapshot = pickCodexSnapshot(response);
  const windows = [snapshot.primary, snapshot.secondary]
    .filter((window): window is RateLimitWindow => Boolean(window) && typeof window?.usedPercent === "number")
    .map(normalizeWindow)
    .sort((a, b) => (a.windowDurationMins ?? Number.MAX_SAFE_INTEGER) - (b.windowDurationMins ?? Number.MAX_SAFE_INTEGER));

  return {
    planType: snapshot.planType ?? null,
    limitId: snapshot.limitId ?? null,
    resetCreditsAvailableCount: response.rateLimitResetCredits?.availableCount ?? null,
    windows
  };
}

function pickCodexSnapshot(response: AppServerRateLimitsResponse): RateLimitSnapshot {
  const byId = response.rateLimitsByLimitId;
  if (byId?.codex) return byId.codex;
  const first = byId ? Object.values(byId)[0] : undefined;
  return first ?? response.rateLimits;
}

function normalizeWindow(window: RateLimitWindow): NormalizedRateLimitWindow {
  const usedPercent = clampPercent(window.usedPercent);
  const duration = window.windowDurationMins;
  const { key, label } = labelWindow(duration);
  return {
    key,
    label,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetsAt: window.resetsAt ?? null,
    windowDurationMins: duration ?? null
  };
}

function labelWindow(duration: number | null): { key: string; label: string } {
  if (duration !== null && Math.abs(duration - 300) <= 5) return { key: "five_hour", label: "5h" };
  if (duration !== null && Math.abs(duration - 10080) <= 60) return { key: "weekly", label: "weekly" };
  if (duration && duration % 1440 === 0) return { key: `window_${duration}m`, label: `${duration / 1440}d` };
  if (duration && duration % 60 === 0) return { key: `window_${duration}m`, label: `${duration / 60}h` };
  return { key: duration ? `window_${duration}m` : "window_unknown", label: duration ? `${duration}m` : "usage" };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function requestRateLimits(options: { timeoutMs?: number }): Promise<AppServerRateLimitsResponse> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const closeDelayMs = Math.min(1500, Math.max(100, timeoutMs - 500));

  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CODEX_HOME: process.env.CODEX_HOME ?? undefined }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new SafeError("usage: app-server slow or timed out; retry in a moment"));
    }, timeoutMs);

    const finish = (error: Error | null, value?: AppServerRateLimitsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      if (error) reject(toSafeError(error));
      else resolve(value as AppServerRateLimitsResponse);
    };

    child.on("error", (error) => finish(toSafeError(error, "usage: app-server unavailable")));

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        handleLine(line, finish);
      }
    });

    child.on("close", () => {
      if (settled) return;
      if (stderr.includes("failed to initialize")) {
        finish(new SafeError("usage: unavailable from app-server; startup may need more time"));
        return;
      }
      finish(new SafeError("usage: unavailable from app-server; startup may need more time"));
    });

    writeJsonLine(child.stdin, {
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "codex-meter", version: "0.2.1" },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: ["account/updated", "account/rateLimits/updated"]
        }
      }
    });
    writeJsonLine(child.stdin, { method: "initialized" });
    writeJsonLine(child.stdin, { id: 2, method: "account/rateLimits/read", params: null });
    setTimeout(() => {
      if (!child.stdin.destroyed) child.stdin.end();
    }, closeDelayMs);
  });
}

function handleLine(
  line: string,
  finish: (error: Error | null, value?: AppServerRateLimitsResponse) => void
): void {
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(line) as JsonRpcMessage;
  } catch {
    return;
  }

  if (message.id !== 2) return;
  if (message.error) {
    finish(new SafeError(`usage: app-server error ${message.error.code ?? "unknown"}`));
    return;
  }
  if (!isRateLimitsResponse(message.result)) {
    finish(new SafeError("usage: unexpected app-server response"));
    return;
  }
  finish(null, message.result);
}

function writeJsonLine(stream: NodeJS.WritableStream, value: unknown): void {
  stream.write(`${JSON.stringify(value)}\n`);
}

function isRateLimitsResponse(value: unknown): value is AppServerRateLimitsResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.rateLimits && typeof record.rateLimits === "object");
}
