import assert from "node:assert/strict";
import { sep } from "node:path";
import test from "node:test";
import { defaultAuthPath, readAuth } from "../dist/auth.js";
import { redactSecrets } from "../dist/errors.js";

test("readAuth reads synthetic access token", async () => {
  const auth = await readAuth("tests/fixtures/auth.synthetic.json");
  assert.equal(auth.accessToken, "synthetic-access-token");
  assert.equal(auth.authMode, "chatgpt");
});

test("defaultAuthPath uses OS path separator", () => {
  const path = defaultAuthPath();
  assert.equal(path.endsWith(`${sep}.codex${sep}auth.json`), true);
});

test("redactSecrets removes known token shapes", () => {
  const redacted = redactSecrets('Bearer eyJabc.def.ghi access_token: "secret" sk-testsecretsecretsecretsecret');
  assert.equal(redacted.includes("secretsecret"), false);
  assert.equal(redacted.includes("access_token"), true);
});
