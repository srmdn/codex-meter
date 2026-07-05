import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { SafeError } from "./errors.js";

export type TokenUsageTotals = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ModelSummary = {
  model: string;
  turns: number;
  sessions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type ActivityDaySummary = {
  date: string;
  sessions: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
};

export type SessionHistorySummary = {
  sessionsScanned: number;
  sessionsWithUsage: number;
  activeDays: number;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  totals: TokenUsageTotals;
  models: ModelSummary[];
  days: ActivityDaySummary[];
};

type ParsedSession = {
  sessionId: string;
  activityAt: string | null;
  totals: TokenUsageTotals | null;
  models: string[];
  modelTotals: Map<string, TokenUsageTotals>;
};

type MutableModelSummary = {
  turns: number;
  sessions: Set<string>;
  totals: TokenUsageTotals;
};

export function defaultSessionsPath(): string {
  return join(homedir(), ".codex", "sessions");
}

export async function readSessionHistorySummary(
  timezone: string,
  rootDir = process.env.CODEX_METER_SESSIONS_DIR || defaultSessionsPath()
): Promise<SessionHistorySummary> {
  const files = await listSessionFiles(rootDir);
  if (files.length === 0) {
    throw new SafeError(`history: no session files found (${rootDir})`);
  }

  const totals = zeroTotals();
  const modelMap = new Map<string, MutableModelSummary>();
  const dayMap = new Map<string, ActivityDaySummary>();
  let sessionsWithUsage = 0;
  let firstActivityAt: string | null = null;
  let lastActivityAt: string | null = null;

  for (const file of files) {
    const session = await parseSessionFile(file);
    if (session.models.length > 0) {
      for (const model of session.models) {
        const entry = modelMap.get(model) ?? { turns: 0, sessions: new Set<string>(), totals: zeroTotals() };
        entry.turns += 1;
        entry.sessions.add(session.sessionId);
        modelMap.set(model, entry);
      }
    }
    for (const [model, totals] of session.modelTotals.entries()) {
      const entry = modelMap.get(model) ?? { turns: 0, sessions: new Set<string>(), totals: zeroTotals() };
      addTotals(entry.totals, totals);
      modelMap.set(model, entry);
    }
    if (!session.totals || !session.activityAt) continue;

    sessionsWithUsage += 1;
    addTotals(totals, session.totals);
    if (!firstActivityAt || session.activityAt < firstActivityAt) firstActivityAt = session.activityAt;
    if (!lastActivityAt || session.activityAt > lastActivityAt) lastActivityAt = session.activityAt;

    const dayKey = localDayKey(session.activityAt, timezone);
    const day = dayMap.get(dayKey) ?? { date: dayKey, sessions: 0, ...zeroTotals() };
    day.sessions += 1;
    addTotals(day, session.totals);
    dayMap.set(dayKey, day);
  }

  return {
    sessionsScanned: files.length,
    sessionsWithUsage,
    activeDays: dayMap.size,
    firstActivityAt,
    lastActivityAt,
    totals,
    models: [...modelMap.entries()]
      .map(([model, value]) => ({
        model,
        turns: value.turns,
        sessions: value.sessions.size,
        inputTokens: value.totals.inputTokens,
        cachedInputTokens: value.totals.cachedInputTokens,
        outputTokens: value.totals.outputTokens,
        reasoningOutputTokens: value.totals.reasoningOutputTokens,
        totalTokens: value.totals.totalTokens
      }))
      .sort((a, b) => b.turns - a.turns || b.sessions - a.sessions || a.model.localeCompare(b.model)),
    days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date))
  };
}

async function listSessionFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSessionFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function parseSessionFile(path: string): Promise<ParsedSession> {
  const models: string[] = [];
  let sessionId = basename(path, ".jsonl");
  let sessionStartedAt: string | null = null;
  let latestUsage: TokenUsageTotals | null = null;
  let latestUsageAt: string | null = null;
  let currentModel: string | null = null;
  const modelTotals = new Map<string, TokenUsageTotals>();

  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of lines) {
    if (!line.trim()) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const type = readString(record, "type");
    if (type === "session_meta") {
      sessionId = readString(record, "payload", "id") ?? sessionId;
      sessionStartedAt = readString(record, "payload", "timestamp") ?? readString(record, "timestamp") ?? sessionStartedAt;
      continue;
    }

    if (type === "turn_context") {
      const model = readString(record, "payload", "model");
      if (model) {
        models.push(model);
        currentModel = model;
      }
      continue;
    }

    if (type !== "event_msg" || readString(record, "payload", "type") !== "token_count") {
      continue;
    }

    const totals = readTotals(record, "payload", "info", "total_token_usage")
      ?? readTotals(record, "payload", "info", "last_token_usage");
    const lastUsage = readTotals(record, "payload", "info", "last_token_usage") ?? totals;
    if (!totals) continue;
    if (currentModel && lastUsage) {
      const entry = modelTotals.get(currentModel) ?? zeroTotals();
      addTotals(entry, lastUsage);
      modelTotals.set(currentModel, entry);
    }

    const timestamp = readString(record, "timestamp") ?? sessionStartedAt;
    if (!latestUsage || totals.totalTokens >= latestUsage.totalTokens) {
      latestUsage = totals;
      latestUsageAt = timestamp;
    }
  }

  return {
    sessionId,
    activityAt: latestUsageAt ?? sessionStartedAt,
    totals: latestUsage,
    models,
    modelTotals
  };
}

function readTotals(value: unknown, ...path: string[]): TokenUsageTotals | null {
  const target = readPath(value, ...path);
  const inputTokens = readNumber(target, "input_tokens");
  const cachedInputTokens = readNumber(target, "cached_input_tokens");
  const outputTokens = readNumber(target, "output_tokens");
  const reasoningOutputTokens = readNumber(target, "reasoning_output_tokens");
  const totalTokens = readNumber(target, "total_tokens");
  if ([inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, totalTokens].some((item) => item === null)) {
    return null;
  }
  return {
    inputTokens: inputTokens as number,
    cachedInputTokens: cachedInputTokens as number,
    outputTokens: outputTokens as number,
    reasoningOutputTokens: reasoningOutputTokens as number,
    totalTokens: totalTokens as number
  };
}

function readPath(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readString(value: unknown, ...path: string[]): string | null {
  const target = readPath(value, ...path);
  return typeof target === "string" && target.length > 0 ? target : null;
}

function readNumber(value: unknown, ...path: string[]): number | null {
  const target = readPath(value, ...path);
  return typeof target === "number" && Number.isFinite(target) ? target : null;
}

function localDayKey(timestamp: string, timezone: string): string {
  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function zeroTotals(): TokenUsageTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0
  };
}

function addTotals(target: TokenUsageTotals, source: TokenUsageTotals): void {
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningOutputTokens += source.reasoningOutputTokens;
  target.totalTokens += source.totalTokens;
}
