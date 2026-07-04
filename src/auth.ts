import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { SafeError, toSafeError } from "./errors.js";

export type AuthInfo = {
  path: string;
  accessToken: string;
  authMode?: string;
  accountId?: string;
};

type CodexAuthFile = {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
};

export function defaultAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}

export async function readAuth(path = defaultAuthPath()): Promise<AuthInfo> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw toSafeError(error, `auth: no ${path}`);
  }

  let parsed: CodexAuthFile;
  try {
    parsed = JSON.parse(raw) as CodexAuthFile;
  } catch {
    throw new SafeError("auth: invalid JSON in auth file");
  }

  const accessToken = parsed.tokens?.access_token;
  if (!accessToken) {
    throw new SafeError("auth: no ChatGPT access token found");
  }

  return {
    path,
    accessToken,
    authMode: parsed.auth_mode,
    accountId: parsed.tokens?.account_id
  };
}
