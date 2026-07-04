import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRateLimits } from "../dist/app-server.js";

test("normalizeRateLimits labels 5h and weekly windows", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/rate-limits.synthetic.json", "utf8"));
  const usage = normalizeRateLimits(data);
  assert.equal(usage.planType, "plus");
  assert.equal(usage.limitId, "codex");
  assert.equal(usage.resetCreditsAvailableCount, 4);
  assert.deepEqual(
    usage.windows.map((window) => [window.key, window.label, window.remainingPercent]),
    [
      ["five_hour", "5h", 65],
      ["weekly", "weekly", 16]
    ]
  );
});
