import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SafeError } from "./errors.js";
import type { SessionHistorySummary } from "./session-history.js";

type PricingValue = number | null;

export type PricingEntry = {
  input_per_1m: number;
  cached_input_per_1m: number;
  output_per_1m: number;
  reasoning_output_per_1m: number;
};

export type PartialPricingEntry = {
  input_per_1m?: PricingValue;
  cached_input_per_1m?: PricingValue;
  output_per_1m?: PricingValue;
  reasoning_output_per_1m?: PricingValue;
};

export type PricingConfig = {
  version: string;
  currency: string;
  placeholder: boolean;
  note: string | null;
  models: Record<string, PartialPricingEntry>;
};

export type CostBreakdown = {
  model: string;
  turns: number;
  sessions: number;
  estimatedCost: number;
  pricingSource: "manual" | "built-in" | "manual+built-in";
  pricingModel: string;
  tokenTotals: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
    totalTokens: number;
  };
};

export type EstimatedCostSummary = {
  estimated: true;
  pricingSource: "manual" | "built-in" | "manual+built-in";
  billingAuthority: "unofficial";
  pricingVersion: string;
  currency: string;
  totalEstimatedCost: number;
  tokenTotals: SessionHistorySummary["totals"];
  breakdown: CostBreakdown[];
  warnings: string[];
};

export type StarterPricingFile = {
  version: string;
  currency: string;
  note: string;
  placeholder: true;
  models: Record<string, {
    input_per_1m: null;
    cached_input_per_1m: null;
    output_per_1m: null;
    reasoning_output_per_1m: null;
  }>;
};

const BUILTIN_PRICING_VERSION = "builtin-estimated-2026-07-06";

const BUILTIN_PRICING: Record<string, PricingEntry> = {
  "gpt-5.5": {
    input_per_1m: 1.25,
    cached_input_per_1m: 0.125,
    output_per_1m: 10,
    reasoning_output_per_1m: 10
  },
  "gpt-5.4": {
    input_per_1m: 1.25,
    cached_input_per_1m: 0.125,
    output_per_1m: 10,
    reasoning_output_per_1m: 10
  },
  "gpt-5.4-mini": {
    input_per_1m: 0.25,
    cached_input_per_1m: 0.025,
    output_per_1m: 2,
    reasoning_output_per_1m: 2
  },
  "gpt-5": {
    input_per_1m: 2.5,
    cached_input_per_1m: 0.25,
    output_per_1m: 12.5,
    reasoning_output_per_1m: 12.5
  },
  "gpt-5.3": {
    input_per_1m: 1.25,
    cached_input_per_1m: 0.125,
    output_per_1m: 10,
    reasoning_output_per_1m: 10
  },
  "gpt-5.3-codex": {
    input_per_1m: 1.25,
    cached_input_per_1m: 0.125,
    output_per_1m: 10,
    reasoning_output_per_1m: 10
  }
};

export function defaultPricingPath(): string {
  return join(homedir(), ".config", "codex-meter", "pricing.json");
}

export async function writeStarterPricing(path: string, models: string[]): Promise<void> {
  const uniqueModels = [...new Set(models)].sort((a, b) => a.localeCompare(b));
  const starter: StarterPricingFile = {
    version: new Date().toISOString().slice(0, 10),
    currency: "USD",
    note: "Null values fall back to codex-meter built-in estimated pricing. Replace them with your own manual prices to override.",
    placeholder: true,
    models: Object.fromEntries(uniqueModels.map((model) => [
      model,
      {
        input_per_1m: null,
        cached_input_per_1m: null,
        output_per_1m: null,
        reasoning_output_per_1m: null
      }
    ]))
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(starter, null, 2)}\n`, "utf8");
}

export async function readPricingConfig(path: string): Promise<PricingConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new SafeError(`pricing: file not found: ${path}`);
    }
    throw new SafeError(`pricing: unable to read ${path}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new SafeError("pricing: expected JSON object");
  }

  const version = readString(parsed, "version");
  const currency = readString(parsed, "currency");
  const models = readObject(parsed, "models");
  const placeholder = readBoolean(parsed, "placeholder");
  const note = readString(parsed, "note");
  if (!version) throw new SafeError("pricing: missing version");
  if (!currency) throw new SafeError("pricing: missing currency");
  if (!models) throw new SafeError("pricing: missing models");

  const normalized: Record<string, PartialPricingEntry> = {};
  for (const [model, value] of Object.entries(models)) {
    if (!value || typeof value !== "object") {
      throw new SafeError(`pricing: invalid model entry for ${model}`);
    }
    normalized[model] = {
      input_per_1m: readNullableNumber(value, "input_per_1m"),
      cached_input_per_1m: readNullableNumber(value, "cached_input_per_1m"),
      output_per_1m: readNullableNumber(value, "output_per_1m"),
      reasoning_output_per_1m: readNullableNumber(value, "reasoning_output_per_1m")
    };
  }

  return { version, currency, placeholder, note, models: normalized };
}

export function estimateCost(summary: SessionHistorySummary, config: PricingConfig | null): EstimatedCostSummary {
  const breakdown: CostBreakdown[] = [];
  const warnings: string[] = [];
  const builtInModels = new Set<string>();
  const manualModels = new Set<string>();
  let totalEstimatedCost = 0;

  for (const model of summary.models) {
    const resolved = resolvePricing(model.model, config);
    if (!resolved) {
      throw new SafeError(`pricing: no estimated price available for model: ${model.model}`);
    }

    const tokenTotals = {
      inputTokens: model.inputTokens,
      cachedInputTokens: model.cachedInputTokens,
      outputTokens: model.outputTokens,
      reasoningOutputTokens: model.reasoningOutputTokens,
      totalTokens: model.totalTokens
    };

    const estimatedCost =
      perMillion(tokenTotals.inputTokens, resolved.entry.input_per_1m) +
      perMillion(tokenTotals.cachedInputTokens, resolved.entry.cached_input_per_1m) +
      perMillion(tokenTotals.outputTokens, resolved.entry.output_per_1m) +
      perMillion(tokenTotals.reasoningOutputTokens, resolved.entry.reasoning_output_per_1m);

    totalEstimatedCost += estimatedCost;
    if (resolved.pricingSource === "built-in") builtInModels.add(model.model);
    else if (resolved.pricingSource === "manual") manualModels.add(model.model);
    else {
      builtInModels.add(model.model);
      manualModels.add(model.model);
    }

    breakdown.push({
      model: model.model,
      turns: model.turns,
      sessions: model.sessions,
      estimatedCost,
      pricingSource: resolved.pricingSource,
      pricingModel: resolved.pricingModel,
      tokenTotals
    });
  }

  const pricingSource = summarizePricingSource(manualModels.size > 0, builtInModels.size > 0);
  if (config?.placeholder) {
    warnings.push("pricing file contains placeholder/null values; built-in estimated pricing is used where needed");
  }
  if (builtInModels.size > 0) {
    warnings.push(`built-in estimated pricing used for: ${[...builtInModels].sort().join(", ")}`);
  }
  if (config?.note) {
    warnings.push(config.note);
  }

  return {
    estimated: true,
    pricingSource,
    billingAuthority: "unofficial",
    pricingVersion: config
      ? pricingSource === "manual"
        ? config.version
        : `${config.version} + ${BUILTIN_PRICING_VERSION}`
      : BUILTIN_PRICING_VERSION,
    currency: config?.currency ?? "USD",
    totalEstimatedCost,
    tokenTotals: summary.totals,
    breakdown: breakdown.sort((a, b) => b.estimatedCost - a.estimatedCost || a.model.localeCompare(b.model)),
    warnings
  };
}

function resolvePricing(model: string, config: PricingConfig | null): {
  entry: PricingEntry;
  pricingSource: "manual" | "built-in" | "manual+built-in";
  pricingModel: string;
} | null {
  const builtIn = findBuiltInPricing(model);
  const manual = config?.models[model] ?? null;
  const merged = {
    input_per_1m: manual?.input_per_1m ?? builtIn?.entry.input_per_1m ?? null,
    cached_input_per_1m: manual?.cached_input_per_1m ?? builtIn?.entry.cached_input_per_1m ?? null,
    output_per_1m: manual?.output_per_1m ?? builtIn?.entry.output_per_1m ?? null,
    reasoning_output_per_1m: manual?.reasoning_output_per_1m ?? builtIn?.entry.reasoning_output_per_1m ?? 0
  };
  if (merged.input_per_1m === null || merged.cached_input_per_1m === null || merged.output_per_1m === null) {
    return null;
  }

  const usesManual = manual !== null && (
    typeof manual.input_per_1m === "number" ||
    typeof manual.cached_input_per_1m === "number" ||
    typeof manual.output_per_1m === "number" ||
    typeof manual.reasoning_output_per_1m === "number"
  );
  const usesBuiltIn =
    (manual?.input_per_1m ?? null) === null ||
    (manual?.cached_input_per_1m ?? null) === null ||
    (manual?.output_per_1m ?? null) === null ||
    (manual?.reasoning_output_per_1m ?? null) === null;

  return {
    entry: {
      input_per_1m: merged.input_per_1m,
      cached_input_per_1m: merged.cached_input_per_1m,
      output_per_1m: merged.output_per_1m,
      reasoning_output_per_1m: merged.reasoning_output_per_1m
    },
    pricingSource: summarizePricingSource(usesManual, usesBuiltIn),
    pricingModel: builtIn?.model ?? model
  };
}

function findBuiltInPricing(model: string): { model: string; entry: PricingEntry } | null {
  const candidates = [model, model.replace(/-codex$/, ""), model.replace(/-instant$/, ""), model.toLowerCase()];
  for (const candidate of candidates) {
    const entry = BUILTIN_PRICING[candidate];
    if (entry) return { model: candidate, entry };
  }
  return null;
}

function summarizePricingSource(usesManual: boolean, usesBuiltIn: boolean): "manual" | "built-in" | "manual+built-in" {
  if (usesManual && usesBuiltIn) return "manual+built-in";
  if (usesManual) return "manual";
  return "built-in";
}

function perMillion(tokens: number, pricePerMillion: number): number {
  return (tokens / 1_000_000) * pricePerMillion;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" && item.length > 0 ? item : null;
}

function readObject(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null;
}

function readNullableNumber(value: unknown, key: string): PricingValue | undefined {
  if (!value || typeof value !== "object" || !(key in value)) return undefined;
  const item = (value as Record<string, unknown>)[key];
  if (item === null) return null;
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function readBoolean(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object" || !(key in value)) return false;
  return (value as Record<string, unknown>)[key] === true;
}
