import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatEstimatedCost, toJsonCost } from "../dist/format.js";
import { defaultPricingPath, estimateCost, readPricingConfig, writeStarterPricing } from "../dist/pricing.js";
import { readSessionHistorySummary } from "../dist/session-history.js";

const fixtureDir = "tests/fixtures/sessions.synthetic";
const pricingFile = "tests/fixtures/pricing.synthetic.json";

test("estimateCost uses manual pricing config and model token totals", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  const pricing = await readPricingConfig(pricingFile);
  const cost = estimateCost(summary, pricing);
  assert.equal(cost.estimated, true);
  assert.equal(cost.pricingSource, "manual");
  assert.equal(cost.pricingVersion, "2026-07-05");
  assert.equal(cost.currency, "USD");
  assert.equal(cost.breakdown[0].model, "gpt-5.5");
  assert.equal(cost.breakdown[0].tokenTotals.totalTokens, 4480);
  assert.equal(cost.breakdown[1].model, "gpt-5");
  assert.equal(cost.breakdown[1].tokenTotals.totalTokens, 1520);
  assert.equal(Number(cost.totalEstimatedCost.toFixed(8)), 0.0134875);
});

test("cost formatters label manual estimate clearly", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  const pricing = await readPricingConfig(pricingFile);
  const cost = estimateCost(summary, pricing);
  assert.match(formatEstimatedCost(cost, "UTC"), /Estimated cost \(manual pricing config\)/);
  assert.match(formatEstimatedCost(cost, "UTC"), /Not official billing/);
  assert.equal(toJsonCost(cost, "UTC").estimated, true);
  assert.equal(toJsonCost(cost, "UTC").pricing_source, "manual");
});

test("estimateCost falls back to built-in pricing when manual values are missing", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  const pricing = JSON.parse(await readFile(pricingFile, "utf8"));
  delete pricing.models["gpt-5"];
  pricing.models["gpt-5.5"].input_per_1m = null;
  const cost = estimateCost(summary, pricing);
  assert.equal(cost.pricingSource, "manual+built-in");
  assert.match(cost.warnings.join("\n"), /built-in estimated pricing used/);
  assert.equal(cost.breakdown.find((item) => item.model === "gpt-5")?.pricingSource, "built-in");
});

test("defaultPricingPath targets user config location", () => {
  assert.match(defaultPricingPath(), /\.config[\/\\]codex-meter[\/\\]pricing\.json$/);
});

test("readPricingConfig reports missing file path clearly", async () => {
  await assert.rejects(() => readPricingConfig("tests/fixtures/does-not-exist.json"), /file not found/);
});

test("starter pricing file can be read and falls back to built-in pricing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "codex-meter-pricing-"));
  const path = join(dir, "pricing.json");
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  await writeStarterPricing(path, ["gpt-5", "gpt-5.5"]);
  const pricing = await readPricingConfig(path);
  const cost = estimateCost(summary, pricing);
  assert.equal(cost.pricingSource, "built-in");
  assert.match(cost.warnings.join("\n"), /placeholder\/null values/);
});
