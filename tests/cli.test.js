import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runCli(args, env = {}) {
  return spawnSync(process.execPath, ["dist/cli.js", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

test("help output shows banner, first-run guidance, and docs link", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /meter/);
  assert.match(result.stdout, /commands:/);
  assert.match(result.stdout, /codex-meter cost --pricing/);
  assert.match(result.stdout, /docs:\s+https:\/\/github\.com\/srmdn\/codex-meter/);
});

test("pricing flags are rejected outside cost", () => {
  const result = runCli(["--pricing", "./pricing.json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only valid with `codex-meter cost`/);
});

test("cost first run auto-creates starter pricing file at default path", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-meter-home-"));
  const result = runCli(["cost", "--pricing"], {
    HOME: home,
    CODEX_METER_SESSIONS_DIR: "tests/fixtures/sessions.synthetic"
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /starter file created at/);
  const createdPath = join(home, ".config", "codex-meter", "pricing.json");
  const created = JSON.parse(await readFile(createdPath, "utf8"));
  assert.equal(created.placeholder, true);
  assert.equal(created.models["gpt-5.5"].input_per_1m, null);
  assert.equal(created.models["gpt-5"].output_per_1m, null);
});

test("version command prints current version", () => {
  const result = runCli(["version"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /codex-meter v0\.4\.2/);
});
