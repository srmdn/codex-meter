# codex-meter

Terminal quota meter for OpenAI Codex.

v0.1 reads local Codex ChatGPT auth, fetches reset-credit count and expiry data, formats expiry times in local timezone, and supports JSON output.

## Usage

```bash
npm run build
node dist/cli.js
node dist/cli.js --json
node dist/cli.js resets
node dist/cli.js doctor
node dist/cli.js --timezone UTC
```

Default output when usage-window data is not implemented yet:

```text
◆ Codex │ repo main
usage: unavailable │ resets: 4, next expires Jul 12, 10:55
```

## Security Model

- Runs locally.
- Reads existing Codex auth from `~/.codex/auth.json`.
- Never asks for passwords.
- Never prints access tokens, refresh tokens, id tokens, API keys, cookies, or raw auth payloads.
- Sends network requests only to the ChatGPT reset-credit endpoint needed for reset-credit expiry data.
- Does not auto-redeem reset credits.
- Uses a short-lived cache in the system temp directory.

Reset-credit expiry data comes from:

```text
GET https://chatgpt.com/backend-api/wham/rate-limit-reset-credits
```

This endpoint is undocumented and may change. For documented reset redemption, use Codex CLI `/usage`.

## Commands

```bash
codex-meter
codex-meter --json
codex-meter resets
codex-meter usage
codex-meter doctor
codex-meter --timezone Asia/Jakarta
```

`usage` is a placeholder in v0.1. v0.2 should use `codex app-server` for 5-hour and weekly usage windows.

## Development

```bash
npm run lint
npm test
npm run build
```

No runtime dependencies.
