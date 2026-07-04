#!/usr/bin/env node
import { access } from "node:fs/promises";
import { readAuth, defaultAuthPath } from "./auth.js";
import { SafeError, toSafeError } from "./errors.js";
import { detectTimezone, formatDefault, formatResets, formatUsage, toJsonOutput, validateTimezone } from "./format.js";
import { repoBranchLabel } from "./git.js";
import { fetchResetCredits } from "./reset-credits.js";
import { readUsageSnapshot, type UsageSnapshot } from "./app-server.js";

type CliOptions = {
  command: "default" | "resets" | "usage" | "doctor";
  json: boolean;
  help: boolean;
  timezone: string;
  cacheTtlSeconds: number;
  authPath: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "default",
    json: false,
    help: false,
    timezone: detectTimezone(),
    cacheTtlSeconds: 300,
    authPath: process.env.CODEX_METER_AUTH_FILE || defaultAuthPath()
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--timezone") options.timezone = requireValue(argv, ++i, "--timezone");
    else if (arg === "--cache-ttl") options.cacheTtlSeconds = Number(requireValue(argv, ++i, "--cache-ttl"));
    else if (arg === "--auth-file") options.authPath = requireValue(argv, ++i, "--auth-file");
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "resets" || arg === "usage" || arg === "doctor") options.command = arg;
    else throw new SafeError(`unknown argument: ${arg}`);
  }

  if (!Number.isFinite(options.cacheTtlSeconds) || options.cacheTtlSeconds < 0) {
    throw new SafeError("cache: --cache-ttl must be a non-negative number");
  }
  validateTimezone(options.timezone);
  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new SafeError(`${flag}: missing value`);
  return value;
}

function helpText(): string {
  return [
    "codex-meter v0.2.0",
    "",
    "Usage:",
    "  codex-meter [--json] [--timezone IANA_ZONE]",
    "  codex-meter resets [--json] [--timezone IANA_ZONE]",
    "  codex-meter usage",
    "  codex-meter doctor [--timezone IANA_ZONE]",
    "",
    "Options:",
    "  --cache-ttl seconds  Cache reset-credit response, default 300",
    "  --auth-file path     Override ~/.codex/auth.json for tests/debugging"
  ].join("\n");
}

async function run(options: CliOptions): Promise<string> {
  if (options.help) {
    return helpText();
  }
  if (options.command === "usage") {
    const usage = await safeReadUsage();
    if (options.json) {
      return JSON.stringify({ timezone: options.timezone, rate_limits: usage ? toJsonOutputRateLimits(usage, options.timezone) : null }, null, 2);
    }
    return formatUsage(usage, options.timezone);
  }
  if (options.command === "doctor") {
    return doctor(options);
  }

  const auth = await readAuth(options.authPath);
  const usagePromise = options.command === "default" ? safeReadUsage() : Promise.resolve(null);
  const result = await fetchResetCredits(auth.accessToken, { cacheTtlSeconds: options.cacheTtlSeconds });
  const usage = await usagePromise;

  if (options.json) {
    return JSON.stringify(toJsonOutput(result.data, options.timezone, result.cache, usage), null, 2);
  }

  if (options.command === "resets") {
    return formatResets(result.data, options.timezone);
  }

  const repo = await repoBranchLabel();
  const header = repo ? `◆ Codex │ ${repo}` : "◆ Codex";
  return formatDefault(result.data, options.timezone, usage).replace("◆ Codex", header);
}

function toJsonOutputRateLimits(usage: UsageSnapshot, timezone: string): NonNullable<ReturnType<typeof toJsonOutput>["rate_limits"]> {
  const rateLimits = toJsonOutput({ credits: [], available_count: 0 }, timezone, { hit: false, ageSeconds: 0, path: "" }, usage).rate_limits;
  if (!rateLimits) throw new SafeError("usage: unavailable from app-server");
  return rateLimits;
}

async function safeReadUsage(): Promise<UsageSnapshot | null> {
  try {
    return await readUsageSnapshot();
  } catch {
    return null;
  }
}

async function doctor(options: CliOptions): Promise<string> {
  const lines: string[] = [];
  try {
    await access(options.authPath);
    lines.push(`auth file: ok (${options.authPath})`);
  } catch {
    lines.push(`auth file: missing (${options.authPath})`);
  }

  let accessToken = "";
  try {
    const auth = await readAuth(options.authPath);
    accessToken = auth.accessToken;
    lines.push("access token: ok");
  } catch (error) {
    lines.push(toSafeError(error).message);
  }

  try {
    validateTimezone(options.timezone);
    lines.push(`timezone: ok (${options.timezone})`);
  } catch (error) {
    lines.push(toSafeError(error).message);
  }

  try {
    await readUsageSnapshot();
    lines.push("app-server: reachable");
  } catch (error) {
    lines.push(toSafeError(error).message);
  }

  if (accessToken) {
    try {
      await fetchResetCredits(accessToken, { cacheTtlSeconds: 0, useCache: false });
      lines.push("endpoint: reachable");
    } catch (error) {
      lines.push(toSafeError(error).message);
    }
  } else {
    lines.push("endpoint: skipped");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    process.stdout.write(`${await run(options)}\n`);
  } catch (error) {
    process.stderr.write(`${toSafeError(error).message}\n`);
    process.exitCode = 1;
  }
}

main();
