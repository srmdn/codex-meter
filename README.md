# codex-meter

Terminal quota meter for OpenAI Codex.

v0.2 reads local Codex usage windows through `codex app-server`, reads reset-credit expiry data through the ChatGPT reset-credit endpoint, formats times in local timezone, and supports JSON output.

## Usage

```bash
npm run build
node dist/cli.js
node dist/cli.js --json
node dist/cli.js resets
node dist/cli.js doctor
node dist/cli.js --timezone UTC
```

Default output:

```text
◆ Codex │ repo main
5h: ▰▰▱▱▱ 46% left, resets Jul 4 14:06 (2h 37m) │ weekly: ▰▱▱▱▱ 13% left, resets Jul 7 09:34 (2d 22h) │ resets: 4, next expires Jul 12 10:55 WIB
```

## Security Model

- Runs locally.
- Reads existing Codex auth from `~/.codex/auth.json`.
- Never asks for passwords.
- Never prints access tokens, refresh tokens, id tokens, API keys, cookies, or raw auth payloads.
- Uses `codex app-server --stdio` for usage-window data.
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

`usage` includes detected timezone context:

```text
Timezone: Asia/Jakarta (WIB, UTC+07:00)
5h: ▰▰▱▱▱ 46% left, resets Jul 4 14:06 (2h 37m)
weekly: ▰▱▱▱▱ 13% left, resets Jul 7 09:34 (2d 22h)
available reset credits: 4
```

`resets` prints the full local expiry list:

```text
Local timezone: Asia/Jakarta (WIB, UTC+07:00)
Reset credits: 4 available
- 2026-07-12 10:55:55.150734 WIB
```

`usage` uses `codex app-server --stdio` for 5-hour and weekly usage windows. If app-server is unavailable, the default command still shows reset-credit data when possible.

## Development

```bash
npm run lint
npm test
npm run build
```

No runtime dependencies.
