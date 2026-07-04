# AGENTS.md - codex-meter

## Project

`codex-meter` is a terminal quota meter for OpenAI Codex.

Primary goal: show Codex quota state clearly and safely from local auth/session data:

- 5-hour usage window
- weekly usage window
- reset-credit count
- reset-credit expiry dates in local timezone
- compact terminal output and JSON output

## Working Rules

- Keep implementation small and auditable.
- Do not print access tokens, refresh tokens, cookies, or raw auth payloads.
- Do not add telemetry.
- Do not auto-redeem reset credits.
- Prefer documented/structured Codex interfaces where available.
- Use the reset-credit endpoint only for data not exposed by Codex app-server.
- Keep `.local/` untracked. It may contain private notes, plans, test captures, and local-only scratch data.

## Data Source Policy

Preferred sources:

1. `codex app-server` protocol for account/rate-limit data when practical.
2. `~/.codex/auth.json` only to obtain local ChatGPT auth tokens.
3. `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits` only for exact reset-credit expiry data.
4. Local git commands for current repo/branch display.

Avoid:

- Browser cookie scraping.
- Hidden WebViews.
- Cloud services.
- Storing secrets outside existing Codex auth storage.
- Inferring reset credits from dismissed UI state, referral docs, or unrelated local metadata.

## Expected Commands

Decide exact stack during implementation. Prefer a minimal Node/TypeScript CLI unless there is a strong reason otherwise.

Likely commands after scaffolding:

```bash
npm test
npm run lint
npm run build
```

## Security

- Treat `~/.codex/auth.json` as secret-bearing.
- Redact tokens in errors, logs, fixtures, snapshots, and docs.
- If tests need auth payloads, use synthetic fixtures only.
- Network requests must be explicit and limited to required OpenAI/ChatGPT endpoints.

## Response Style

- Address user as `Boss Said`.
- Keep responses terse and technical.
- Report commands run and results.
