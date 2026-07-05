import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatEstimatedCost, toJsonCost } from "../dist/format.js";
import { defaultPricingPath, estimateCost, readManualPricing } from "../dist/pricing.js";
import { readSessionHistorySummary } from "../dist/session-history.js";

const fixtureDir = "tests/fixtures/sessions.synthetic";
const pricingFile = "tests/fixtures/pricing.synthetic.json";

test("estimateCost uses manual pricing config and model token totals", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  const pricing = await readManualPricing(pricingFile);
  const cost = estimateCost(summary, pricing);
  assert.equal(cost.estimated, true);
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
  const pricing = await readManualPricing(pricingFile);
  const cost = estimateCost(summary, pricing);
  assert.match(formatEstimatedCost(cost, "UTC"), /Estimated cost \(manual pricing config\)/);
  assert.match(formatEstimatedCost(cost, "UTC"), /Not official billing/);
  assert.equal(toJsonCost(cost, "UTC").estimated, true);
  assert.equal(toJsonCost(cost, "UTC").pricing_source, "manual");
});

test("readManualPricing rejects missing model prices during estimation", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  const pricing = JSON.parse(await readFile(pricingFile, "utf8"));
  delete pricing.models["gpt-5"];
  assert.throws(() => estimateCost(summary, pricing), /no manual price configured for model: gpt-5/);
});

test("defaultPricingPath targets user config location", () => {
  assert.match(defaultPricingPath(), /\.config[\/\\]codex-meter[\/\\]pricing\.json$/);
});

test("readManualPricing reports missing file path clearly", async () => {
  await assert.rejects(() => readManualPricing("tests/fixtures/does-not-exist.json"), /file not found/);
});
