import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CacheMeta = {
  hit: boolean;
  ageSeconds: number;
  path: string;
};

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

export function cachePath(key: string): string {
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(tmpdir(), "codex-meter", `${hash}.json`);
}

export async function readCache<T>(key: string, ttlSeconds: number): Promise<{ value: T; meta: CacheMeta } | null> {
  const path = cachePath(key);
  try {
    const envelope = JSON.parse(await readFile(path, "utf8")) as CacheEnvelope<T>;
    const ageSeconds = Math.max(0, Math.floor((Date.now() - envelope.savedAt) / 1000));
    if (ageSeconds > ttlSeconds) return null;
    return { value: envelope.value, meta: { hit: true, ageSeconds, path } };
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<CacheMeta> {
  const path = cachePath(key);
  await mkdir(join(tmpdir(), "codex-meter"), { recursive: true });
  await writeFile(path, JSON.stringify({ savedAt: Date.now(), value }), "utf8");
  return { hit: false, ageSeconds: 0, path };
}
