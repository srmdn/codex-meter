# codex-meter

Terminal quota meter and local usage analytics for OpenAI Codex.

v0.4 keeps the default quota meter fast and compact, then adds separate local-history analytics commands for session totals, favorite models, activity by day, and manual estimated cost.

The default command is cache-first for speed. Use `--live` to force fresh reads.

## Usage

```bash
npm run build
node dist/cli.js
node dist/cli.js --json
node dist/cli.js resets
node dist/cli.js stats
node dist/cli.js models
node dist/cli.js activity
node dist/cli.js cost --pricing tests/fixtures/pricing.synthetic.json
node dist/cli.js doctor
node dist/cli.js --timezone UTC
node dist/cli.js --live
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
codex-meter stats
codex-meter models
codex-meter activity
codex-meter cost
codex-meter doctor
codex-meter --timezone Asia/Jakarta
codex-meter --live
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

By default, `codex-meter` prefers cached usage data for a fast terminal response. `--live` bypasses cache and forces fresh app-server and reset-credit reads.

`stats`, `models`, and `activity` read local Codex session history from `~/.codex/sessions/`. They do not change current quota state or call external services.

`cost` reads the same local session history, plus a user-supplied manual pricing file. It is always labeled estimated and is not official billing.

## Estimated Cost Setup

`codex-meter cost` requires a pricing file.

Default path:

```text
~/.config/codex-meter/pricing.json
```

Commands:

```bash
codex-meter cost --pricing
codex-meter cost --json --pricing
codex-meter cost --pricing ./pricing.json
codex-meter cost --pricing-file ./pricing.json
```

Create a pricing file before using `cost`.

Example `stats` output:

```text
Timezone: Asia/Jakarta (WIB, UTC+07:00)
Sessions scanned: 42
Sessions with usage: 39
Active days: 11
Favorite model: gpt-5.5 (84 turns, 28 sessions)
Last activity: Jul 5 15:12 WIB
Total tokens: 1,234,567
```

Example manual pricing file:

```json
{
  "version": "2026-07-05",
  "currency": "USD",
  "models": {
    "gpt-5.5": {
      "input_per_1m": 1.25,
      "cached_input_per_1m": 0.125,
      "output_per_1m": 10,
      "reasoning_output_per_1m": 10
    }
  }
}
```

How estimated cost is calculated:

- Reads local Codex session history from `~/.codex/sessions/`
- Groups token usage by model
- Applies your manual per-model prices:
  - `input_per_1m`
  - `cached_input_per_1m`
  - `output_per_1m`
  - `reasoning_output_per_1m`
- Sums per-model estimated cost into total estimated cost

Formula:

```text
estimated cost =
  input_tokens * input_per_1m / 1,000,000 +
  cached_input_tokens * cached_input_per_1m / 1,000,000 +
  output_tokens * output_per_1m / 1,000,000 +
  reasoning_output_tokens * reasoning_output_per_1m / 1,000,000
```

Example `cost` output:

```text
Estimated cost (manual pricing config)
Timezone: Asia/Jakarta (WIB, UTC+07:00)
Pricing version: 2026-07-05
Total estimated cost: $12.34
Total tokens: 1,234,567
By model:
gpt-5.5: $12.34 (84 turns, 1,234,567 tokens)
Estimated only. Calculated from local session tokens + manual pricing config. Not official billing.
```

Disclaimer:

- Estimated cost uses local Codex session tokens plus your manual pricing file.
- It is not official OpenAI billing.
- If a model appears in local history without a matching manual price, `codex-meter cost` fails instead of guessing.

## Development

```bash
npm run lint
npm test
npm run build
```

No runtime dependencies.
