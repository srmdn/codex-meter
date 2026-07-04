import assert from "node:assert/strict";
import test from "node:test";
import { readAuth } from "../dist/auth.js";
import { redactSecrets } from "../dist/errors.js";

test("readAuth reads synthetic access token", async () => {
  const auth = await readAuth("tests/fixtures/auth.synthetic.json");
  assert.equal(auth.accessToken, "synthetic-access-token");
  assert.equal(auth.authMode, "chatgpt");
});

test("redactSecrets removes known token shapes", () => {
  const redacted = redactSecrets('Bearer eyJabc.def.ghi access_token: "secret" sk-testsecretsecretsecretsecret');
  assert.equal(redacted.includes("secretsecret"), false);
  assert.equal(redacted.includes("access_token"), true);
});
