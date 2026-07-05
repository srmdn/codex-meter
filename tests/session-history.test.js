import assert from "node:assert/strict";
import test from "node:test";
import { formatActivity, formatModels, formatStats, toJsonActivity, toJsonModels, toJsonStats } from "../dist/format.js";
import { readSessionHistorySummary } from "../dist/session-history.js";

const fixtureDir = "tests/fixtures/sessions.synthetic";

test("readSessionHistorySummary aggregates session totals and favorite model", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  assert.equal(summary.sessionsScanned, 2);
  assert.equal(summary.sessionsWithUsage, 2);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.totals.totalTokens, 6000);
  assert.equal(summary.totals.inputTokens, 5700);
  assert.equal(summary.models[0].model, "gpt-5.5");
  assert.equal(summary.models[0].turns, 3);
  assert.equal(summary.models[0].sessions, 2);
  assert.equal(summary.days[0].date, "2026-07-02");
  assert.equal(summary.days[0].totalTokens, 4120);
});

test("history formatters expose stats, models, and activity views", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  assert.match(formatStats(summary, "UTC"), /Total tokens: 6,000/);
  assert.match(formatModels(summary, "UTC"), /gpt-5\.5: 3 turns, 2 sessions/);
  assert.match(formatActivity(summary, "UTC"), /2026-07-02: 1 session, 4,120 total tokens/);
});

test("history JSON helpers keep structured analytics", async () => {
  const summary = await readSessionHistorySummary("UTC", fixtureDir);
  assert.equal(toJsonStats(summary, "UTC").totals.total_tokens, 6000);
  assert.equal(toJsonModels(summary, "UTC").models[1].model, "gpt-5");
  assert.equal(toJsonActivity(summary, "UTC").days[0].date, "2026-07-02");
});
