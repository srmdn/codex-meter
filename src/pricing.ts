import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SafeError } from "./errors.js";
import type { SessionHistorySummary } from "./session-history.js";

export type ManualPricing = {
  version: string;
  currency: string;
  models: Record<string, ManualModelPricing>;
};

export type ManualModelPricing = {
  input_per_1m: number;
  cached_input_per_1m: number;
  output_per_1m: number;
  reasoning_output_per_1m?: number;
};

export type CostBreakdown = {
  model: string;
  turns: number;
  sessions: number;
  estimatedCost: number;
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
  pricingSource: "manual";
  billingAuthority: "unofficial";
  pricingVersion: string;
  currency: string;
  totalEstimatedCost: number;
  tokenTotals: SessionHistorySummary["totals"];
  breakdown: CostBreakdown[];
};

export function defaultPricingPath(): string {
  return join(homedir(), ".config", "codex-meter", "pricing.json");
}

export async function readManualPricing(path: string): Promise<ManualPricing> {
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
  if (!version) throw new SafeError("pricing: missing version");
  if (!currency) throw new SafeError("pricing: missing currency");
  if (!models) throw new SafeError("pricing: missing models");

  const validated: Record<string, ManualModelPricing> = {};
  for (const [model, value] of Object.entries(models)) {
    if (!value || typeof value !== "object") {
      throw new SafeError(`pricing: invalid model entry for ${model}`);
    }
    const input = readNumber(value, "input_per_1m");
    const cachedInput = readNumber(value, "cached_input_per_1m");
    const output = readNumber(value, "output_per_1m");
    const reasoning = readOptionalNumber(value, "reasoning_output_per_1m");
    if (input === null || cachedInput === null || output === null) {
      throw new SafeError(`pricing: incomplete prices for ${model}`);
    }
    validated[model] = {
      input_per_1m: input,
      cached_input_per_1m: cachedInput,
      output_per_1m: output,
      reasoning_output_per_1m: reasoning ?? 0
    };
  }

  return { version, currency, models: validated };
}

export function estimateCost(summary: SessionHistorySummary, pricing: ManualPricing): EstimatedCostSummary {
  const breakdown: CostBreakdown[] = [];
  let totalEstimatedCost = 0;

  for (const model of summary.models) {
    const modelPricing = pricing.models[model.model];
    if (!modelPricing) {
      throw new SafeError(`pricing: no manual price configured for model: ${model.model}`);
    }
    const tokenTotals = {
      inputTokens: model.inputTokens,
      cachedInputTokens: model.cachedInputTokens,
      outputTokens: model.outputTokens,
      reasoningOutputTokens: model.reasoningOutputTokens,
      totalTokens: model.totalTokens
    };

    const estimatedCost =
      perMillion(tokenTotals.inputTokens, modelPricing.input_per_1m) +
      perMillion(tokenTotals.cachedInputTokens, modelPricing.cached_input_per_1m) +
      perMillion(tokenTotals.outputTokens, modelPricing.output_per_1m) +
      perMillion(tokenTotals.reasoningOutputTokens, modelPricing.reasoning_output_per_1m ?? 0);

    totalEstimatedCost += estimatedCost;
    breakdown.push({
      model: model.model,
      turns: model.turns,
      sessions: model.sessions,
      estimatedCost,
      tokenTotals
    });
  }

  return {
    estimated: true,
    pricingSource: "manual",
    billingAuthority: "unofficial",
    pricingVersion: pricing.version,
    currency: pricing.currency,
    totalEstimatedCost,
    tokenTotals: summary.totals,
    breakdown: breakdown.sort((a, b) => b.estimatedCost - a.estimatedCost || a.model.localeCompare(b.model))
  };
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

function readNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function readOptionalNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || !(key in value)) return null;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}
