import { readCache, writeCache, type CacheMeta } from "./cache.js";
import { SafeError, toSafeError } from "./errors.js";

export const RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

export type ResetCredit = {
  id?: string;
  reset_type?: string;
  status?: string;
  granted_at?: string;
  expires_at?: string;
  redeem_started_at?: string | null;
  redeemed_at?: string | null;
  title?: string;
};

export type ResetCreditsResponse = {
  credits: ResetCredit[];
  available_count: number;
  total_earned_count?: number;
};

export type ResetCreditsResult = {
  data: ResetCreditsResponse;
  cache: CacheMeta;
  source: "network" | "cache";
};

export function availableCredits(data: ResetCreditsResponse): ResetCredit[] {
  return (data.credits ?? [])
    .filter((credit) => credit.status === "available" && Boolean(credit.expires_at))
    .sort((a, b) => Date.parse(a.expires_at ?? "") - Date.parse(b.expires_at ?? ""));
}

export function codexAvailableCredits(data: ResetCreditsResponse): ResetCredit[] {
  const codex = availableCredits(data).filter((credit) => credit.reset_type === "codex_rate_limits");
  return codex.length > 0 ? codex : availableCredits(data);
}

export async function fetchResetCredits(
  accessToken: string,
  options: { cacheTtlSeconds?: number; useCache?: boolean } = {}
): Promise<ResetCreditsResult> {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? 300;
  const key = RESET_CREDITS_URL;

  if (options.useCache !== false) {
    const cached = await readCache<ResetCreditsResponse>(key, cacheTtlSeconds);
    if (cached) return { data: cached.value, cache: cached.meta, source: "cache" };
  }

  let response: Response;
  try {
    response = await fetch(RESET_CREDITS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    throw toSafeError(error, "resets: network error");
  }

  if (response.status === 401 || response.status === 403) {
    throw new SafeError("resets: auth expired");
  }
  if (!response.ok) {
    throw new SafeError(`resets: endpoint returned HTTP ${response.status}`);
  }

  let data: ResetCreditsResponse;
  try {
    data = (await response.json()) as ResetCreditsResponse;
  } catch {
    throw new SafeError("resets: invalid JSON from endpoint");
  }

  if (!Array.isArray(data.credits) || typeof data.available_count !== "number") {
    throw new SafeError("resets: unexpected response shape");
  }

  return { data, cache: await writeCache(key, data), source: "network" };
}
