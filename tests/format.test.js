import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRateLimits } from "../dist/app-server.js";
import { formatLocal, formatLocalPrecise, formatResets, formatUsage, timezoneLabel, toJsonOutput, validateTimezone } from "../dist/format.js";

test("formatLocal uses requested timezone", () => {
  assert.equal(formatLocal("2026-07-12T03:55:55.150734Z", "Asia/Jakarta"), "2026-07-12 10:55:55");
});

test("formatLocalPrecise preserves fractional seconds", () => {
  assert.equal(formatLocalPrecise("2026-07-12T03:55:55.150734Z", "Asia/Jakarta"), "2026-07-12 10:55:55.150734");
});

test("timezoneLabel includes IANA name and offset", () => {
  assert.equal(timezoneLabel("UTC", new Date("2026-07-12T03:55:55Z")), "UTC (UTC, UTC+00:00)");
  assert.equal(timezoneLabel("Asia/Jakarta", new Date("2026-07-12T03:55:55Z")), "Asia/Jakarta (WIB, UTC+07:00)");
});

test("validateTimezone rejects invalid IANA zone", () => {
  assert.throws(() => validateTimezone("Nope/Zone"), /invalid IANA timezone/);
});

test("JSON output preserves UTC timestamp and adds local timestamp", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/reset-credits.synthetic.json", "utf8"));
  const output = toJsonOutput(data, "UTC", { hit: false, ageSeconds: 0, path: "cache" });
  assert.equal(output.reset_credits.next_expires_at, "2026-07-12T03:55:55.150734Z");
  assert.equal(output.reset_credits.next_expires_at_local, "2026-07-12 03:55:55");
});

test("JSON output includes rate limits when available", async () => {
  const resetData = JSON.parse(await readFile("tests/fixtures/reset-credits.synthetic.json", "utf8"));
  const rateData = JSON.parse(await readFile("tests/fixtures/rate-limits.synthetic.json", "utf8"));
  const output = toJsonOutput(resetData, "UTC", { hit: false, ageSeconds: 0, path: "cache" }, normalizeRateLimits(rateData));
  assert.equal(output.rate_limits?.plan_type, "plus");
  assert.equal(output.rate_limits?.five_hour?.remaining_percent, 65);
  assert.equal(output.rate_limits?.weekly?.remaining_percent, 16);
});

test("resets output includes all available expiry dates", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/reset-credits.synthetic.json", "utf8"));
  assert.match(formatResets(data, "UTC"), /Local timezone: UTC/);
  assert.match(formatResets(data, "UTC"), /- 2026-07-12 03:55:55\.150734 UTC/);
});

test("usage output formats normalized windows", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/rate-limits.synthetic.json", "utf8"));
  assert.match(formatUsage(normalizeRateLimits(data), "UTC"), /Timezone: UTC/);
  assert.match(formatUsage(normalizeRateLimits(data), "UTC"), /5h: .*65% left/);
  assert.match(formatUsage(normalizeRateLimits(data), "UTC"), /weekly: .*16% left/);
  assert.match(formatUsage(normalizeRateLimits(data), "UTC"), /available reset credits: 4/);
});
