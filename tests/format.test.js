import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatLocal, formatResets, toJsonOutput, validateTimezone } from "../dist/format.js";

test("formatLocal uses requested timezone", () => {
  assert.equal(formatLocal("2026-07-12T03:55:55.150734Z", "Asia/Jakarta"), "2026-07-12 10:55:55");
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

test("resets output includes all available expiry dates", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/reset-credits.synthetic.json", "utf8"));
  assert.match(formatResets(data, "UTC"), /2026-07-12 03:55:55 UTC/);
});
