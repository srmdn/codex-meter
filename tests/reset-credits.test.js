import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { availableCredits, codexAvailableCredits } from "../dist/reset-credits.js";

test("availableCredits filters redeemed credits", async () => {
  const data = JSON.parse(await readFile("tests/fixtures/reset-credits.synthetic.json", "utf8"));
  assert.equal(availableCredits(data).length, 1);
  assert.equal(codexAvailableCredits(data)[0].id, "RateLimitResetCredit_synthetic_1");
});
