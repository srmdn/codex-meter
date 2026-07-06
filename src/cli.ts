#!/usr/bin/env node
import { access } from "node:fs/promises";
import { readAuth, defaultAuthPath } from "./auth.js";
import { type CacheMeta } from "./cache.js";
import { SafeError, toSafeError } from "./errors.js";
import {
  detectTimezone,
  formatActivity,
  formatDefault,
  formatEstimatedCost,
  formatModels,
  formatResets,
  formatStats,
  formatUsage,
  toJsonActivity,
  toJsonCost,
  toJsonModels,
  toJsonOutput,
  toJsonStats,
  validateTimezone
} from "./format.js";
import { repoBranchLabel } from "./git.js";
import { fetchResetCredits } from "./reset-credits.js";
import { getUsageSnapshot, readUsageSnapshot, type UsageSnapshot, type UsageSnapshotResult } from "./app-server.js";
import { readSessionHistorySummary } from "./session-history.js";
import { defaultPricingPath, estimateCost, readPricingConfig, writeStarterPricing } from "./pricing.js";

type CliOptions = {
  command: "default" | "status" | "resets" | "usage" | "doctor" | "stats" | "models" | "activity" | "cost" | "version" | "help";
  json: boolean;
  help: boolean;
  live: boolean;
  timezone: string;
  cacheTtlSeconds: number;
  usageCacheTtlSeconds: number;
  authPath: string;
  pricingPath: string | null;
  pricingFlagUsed: boolean;
};

const VERSION = "0.4.3";
const DOCS_URL = "https://github.com/srmdn/codex-meter";
const BANNER = [
  "  ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗",
  " ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝",
  " ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ",
  " ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ",
  " ╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗",
  "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝",
  "                meter"
].join("\n");

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    command: "default",
    json: false,
    help: false,
    live: false,
    timezone: detectTimezone(),
    cacheTtlSeconds: 300,
    usageCacheTtlSeconds: 30,
    authPath: process.env.CODEX_METER_AUTH_FILE || defaultAuthPath(),
    pricingPath: process.env.CODEX_METER_PRICING_FILE || null,
    pricingFlagUsed: false
  };
  const commands: CliOptions["command"][] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--live") options.live = true;
    else if (arg === "--timezone") options.timezone = requireValue(argv, ++i, "--timezone");
    else if (arg === "--cache-ttl") options.cacheTtlSeconds = Number(requireValue(argv, ++i, "--cache-ttl"));
    else if (arg === "--cache-ttl-usage") options.usageCacheTtlSeconds = Number(requireValue(argv, ++i, "--cache-ttl-usage"));
    else if (arg === "--auth-file") options.authPath = requireValue(argv, ++i, "--auth-file");
    else if (arg === "--pricing") {
      const value = optionalValue(argv, i + 1);
      if (value) i += 1;
      options.pricingPath = value ?? defaultPricingPath();
      options.pricingFlagUsed = true;
    }
    else if (arg === "--pricing-file") {
      options.pricingPath = requireValue(argv, ++i, "--pricing-file");
      options.pricingFlagUsed = true;
    }
    else if (arg === "--help" || arg === "-h") {
      options.help = true;
      options.command = "help";
    }
    else if (arg === "help" || arg === "version" || arg === "status" || arg === "resets" || arg === "usage" || arg === "doctor" || arg === "stats" || arg === "models" || arg === "activity" || arg === "cost") {
      commands.push(arg);
      options.command = arg;
    }
    else throw new SafeError(`unknown argument: ${arg}`);
  }

  if (commands.length > 1) {
    throw new SafeError(`command: expected one command, got ${commands.join(" and ")}`);
  }

  if (!Number.isFinite(options.cacheTtlSeconds) || options.cacheTtlSeconds < 0) {
    throw new SafeError("cache: --cache-ttl must be a non-negative number");
  }
  if (!Number.isFinite(options.usageCacheTtlSeconds) || options.usageCacheTtlSeconds < 0) {
    throw new SafeError("cache: --cache-ttl-usage must be a non-negative number");
  }
  if (options.pricingFlagUsed && !options.help && options.command !== "cost") {
    throw new SafeError("pricing: --pricing and --pricing-file are only valid with `codex-meter cost`");
  }
  validateTimezone(options.timezone);
  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new SafeError(`${flag}: missing value`);
  return value;
}

function optionalValue(argv: string[], index: number): string | null {
  const value = argv[index];
  if (!value || value.startsWith("-")) return null;
  return value;
}

function helpText(): string {
  return [
    BANNER,
    "",
    "terminal quota meter for codex",
    "",
    "commands:",
    "  status         current quota + reset credits",
    "  usage          detailed 5h / weekly windows",
    "  resets         reset-credit expiry list",
    "  stats          local token totals and summary",
    "  models         most-used local models",
    "  activity       daily local token activity",
    "  cost           estimated cost from local tokens + pricing fallback",
    "                 --pricing [path]   use default or custom pricing file",
    "  doctor         auth, app-server, cache, pricing checks",
    "  version        show version",
    "  help           show this help",
    "",
    "first run:",
    "  codex-meter",
    "  codex-meter cost --pricing",
    "  creates default pricing file and still shows an estimate",
    "",
    "notes:",
    `  cost uses local session history + built-in estimates + local overrides`,
    "  estimated only, not official billing",
    `  default pricing path: ${defaultPricingPath()}`,
    "",
    `docs:  ${DOCS_URL}`
  ].join("\n");
}

async function run(options: CliOptions): Promise<string> {
  if (options.help || options.command === "help") {
    return helpText();
  }
  if (options.command === "version") {
    return `codex-meter v${VERSION}`;
  }
  if (options.command === "usage") {
    const usageResult = await safeReadUsage({
      useCache: !options.live,
      cacheTtlSeconds: options.usageCacheTtlSeconds,
      allowStaleOnError: !options.live
    });
    const usage = usageResult?.data ?? null;
    if (options.json) {
      return JSON.stringify({ timezone: options.timezone, rate_limits: usage ? toJsonOutputRateLimits(usage, options.timezone) : null }, null, 2);
    }
    return formatUsage(usage, options.timezone);
  }
  if (options.command === "doctor") {
    return doctor(options);
  }
  if (options.command === "stats" || options.command === "models" || options.command === "activity") {
    const summary = await readSessionHistorySummary(options.timezone);
    if (options.json) {
      if (options.command === "stats") return JSON.stringify(toJsonStats(summary, options.timezone), null, 2);
      if (options.command === "models") return JSON.stringify(toJsonModels(summary, options.timezone), null, 2);
      return JSON.stringify(toJsonActivity(summary, options.timezone), null, 2);
    }
    if (options.command === "stats") return formatStats(summary, options.timezone);
    if (options.command === "models") return formatModels(summary, options.timezone);
    return formatActivity(summary, options.timezone);
  }
  if (options.command === "cost") {
    if (!options.pricingPath) {
      throw new SafeError("pricing: provide --pricing or --pricing-file for estimated cost");
    }
    const history = await readSessionHistorySummary(options.timezone);
    let preface = "";
    if (options.pricingPath === defaultPricingPath()) {
      try {
        await access(options.pricingPath);
      } catch (error) {
        await writeStarterPricing(options.pricingPath, history.models.map((model) => model.model));
        preface = `pricing: starter file created at ${options.pricingPath}\nusing built-in estimated pricing until you replace placeholder null values\n\n`;
      }
    }
    const pricing = await readPricingConfig(options.pricingPath);
    const cost = estimateCost(history, pricing);
    if (options.json) {
      return JSON.stringify(toJsonCost(cost, options.timezone), null, 2);
    }
    return `${preface}${formatEstimatedCost(cost, options.timezone)}`.trimEnd();
  }

  const auth = await readAuth(options.authPath);
  const usagePromise =
    options.command === "default" || options.command === "status"
      ? safeReadUsage({
          useCache: !options.live,
          cacheTtlSeconds: options.usageCacheTtlSeconds,
          allowStaleOnError: true
        })
      : Promise.resolve(null);
  const result = await fetchResetCredits(auth.accessToken, {
    cacheTtlSeconds: options.cacheTtlSeconds,
    useCache: !options.live
  });
  const usage = (await usagePromise)?.data ?? null;

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
  if (!rateLimits) throw new SafeError("usage: unavailable from app-server; startup may need more time");
  return rateLimits;
}

async function safeReadUsage(
  options: {
    useCache: boolean;
    cacheTtlSeconds: number;
    allowStaleOnError: boolean;
  }
): Promise<UsageSnapshotResult | null> {
  try {
    return await getUsageSnapshot(options);
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
    await access(defaultPricingPath());
    lines.push(`pricing file: ok (${defaultPricingPath()})`);
  } catch {
    lines.push(`pricing file: missing (${defaultPricingPath()})`);
  }

  try {
    const usage = await getUsageSnapshot({
      useCache: true,
      cacheTtlSeconds: options.usageCacheTtlSeconds,
      allowStaleOnError: true
    });
    lines.push(`usage cache: ${describeCache(usage.cache, usage.source)}`);
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

function describeCache(cache: CacheMeta, source: UsageSnapshotResult["source"]): string {
  if (source === "network") return "refreshed";
  if (source === "stale-cache") return `stale (${cache.ageSeconds}s old)`;
  return `fresh (${cache.ageSeconds}s old)`;
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
