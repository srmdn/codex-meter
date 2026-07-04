import assert from "node:assert/strict";
import { sep } from "node:path";
import test from "node:test";
import { cachePath, readCache, readCacheEntry, writeCache } from "../dist/cache.js";

test("cachePath uses OS temp path and separator", () => {
  const path = cachePath("synthetic-key");
  assert.equal(path.includes(`${sep}codex-meter${sep}`), true);
  assert.equal(path.endsWith(".json"), true);
});

test("cache round-trips JSON values", async () => {
  const key = `synthetic-${Date.now()}`;
  await writeCache(key, { ok: true });
  const cached = await readCache(key, 300);
  assert.equal(cached?.value.ok, true);
  assert.equal(cached?.meta.hit, true);
});

test("readCacheEntry returns stale entries without ttl filtering", async () => {
  const key = `synthetic-entry-${Date.now()}`;
  await writeCache(key, { ok: true });
  const cached = await readCacheEntry(key);
  assert.equal(cached?.value.ok, true);
  assert.equal(cached?.meta.hit, true);
});
