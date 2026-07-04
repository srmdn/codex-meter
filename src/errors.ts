export class SafeError extends Error {
  constructor(message: string) {
    super(redactSecrets(message));
    this.name = "SafeError";
  }
}

export function toSafeError(error: unknown, prefix?: string): SafeError {
  const message = error instanceof Error ? error.message : String(error);
  return new SafeError(prefix ? `${prefix}: ${message}` : message);
}

export function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/"?(access_token|refresh_token|id_token|OPENAI_API_KEY)"?\s*[:=]\s*"[^"]+"/gi, "$1: [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[REDACTED_JWT]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_KEY]");
}
