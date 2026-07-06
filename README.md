# codex-meter

Terminal quota meter and local usage analytics for OpenAI Codex.

v0.4.3 keeps the default quota meter fast and compact, adds separate local-history analytics commands, and lets `cost` work immediately with built-in estimated pricing plus optional local overrides.

The default command is cache-first for speed. Use `--live` to force fresh reads.

## Usage

```bash
npm run build
node dist/cli.js
node dist/cli.js status
node dist/cli.js --json
node dist/cli.js resets
node dist/cli.js stats
node dist/cli.js models
node dist/cli.js activity
node dist/cli.js cost --pricing
node dist/cli.js doctor
node dist/cli.js version
node dist/cli.js --help
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
codex-meter status
codex-meter --json
codex-meter resets
codex-meter usage
codex-meter stats
codex-meter models
codex-meter activity
codex-meter cost --pricing
codex-meter doctor
codex-meter version
codex-meter --help
codex-meter --timezone Asia/Jakarta
codex-meter --live
```

Command notes:

- `codex-meter` and `codex-meter status` show the same current quota/reset view
- `codex-meter version` prints the installed CLI version
- `--pricing` and `--pricing-file` are only valid with `codex-meter cost`

`--help` shows the product-style banner and first-run guidance. The banner does not appear in normal status output, JSON output, or error output.

Example `--help` output:

```text
  ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
 ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝
 ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗
 ╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
                meter

terminal quota meter for codex
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

`cost` reads the same local session history, then uses built-in estimated pricing and optional local pricing overrides. It is always labeled estimated and is not official billing.

## Estimated Cost Setup

`codex-meter cost --pricing` uses the default pricing path:

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

First cost run:

1. Run:

   ```bash
   codex-meter cost --pricing
   ```

2. If the default file is missing, `codex-meter` creates:

   ```text
   ~/.config/codex-meter/pricing.json
   ```

3. `codex-meter` still returns an estimate immediately using built-in estimated pricing.

4. Optionally replace the placeholder `null` values with your manual prices to override built-in estimates.

5. Rerun if you want to see the effect of your overrides:

   ```bash
   codex-meter cost --pricing
   ```

First run behavior:

- `codex-meter cost --pricing` checks `~/.config/codex-meter/pricing.json`
- if the file is missing, `codex-meter` creates a starter file there
- it scaffolds models detected from your local Codex session history
- it still returns an estimate immediately using built-in estimated pricing
- you can later replace `null` values with your own manual overrides
- `codex-meter cost --pricing ./pricing.json` and `--pricing-file ./pricing.json` are custom-path override modes; those paths are not auto-created for you

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

Example starter pricing file created on first run:

```json
{
  "version": "2026-07-06",
  "currency": "USD",
  "note": "Null values fall back to codex-meter built-in estimated pricing. Replace them with your own manual prices to override.",
  "placeholder": true,
  "models": {
    "gpt-5.4": {
      "input_per_1m": null,
      "cached_input_per_1m": null,
      "output_per_1m": null,
      "reasoning_output_per_1m": null
    },
    "gpt-5.5": {
      "input_per_1m": null,
      "cached_input_per_1m": null,
      "output_per_1m": null,
      "reasoning_output_per_1m": null
    }
  }
}
```

Example filled manual override file:

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

The starter file uses placeholder `null` values on purpose. `codex-meter cost` falls back to built-in estimated pricing for those models. Add manual numbers only when you want to override the built-in estimate.

How estimated cost is calculated:

- Reads local Codex session history from `~/.codex/sessions/`
- Groups token usage by model
- Resolves pricing in this order:
  - manual per-model override from your pricing file
  - built-in estimated pricing fallback
- Applies per-model prices:
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
pricing: starter file created at /Users/said/.config/codex-meter/pricing.json
using built-in estimated pricing until you replace placeholder null values

Estimated cost (built-in pricing)
Timezone: Asia/Jakarta (WIB, UTC+07:00)
Pricing source: built-in estimate
Pricing version: 2026-07-06 + builtin-estimated-2026-07-06
Total estimated cost: $12.34
Total tokens: 1,234,567
Warning: pricing file contains placeholder/null values; built-in estimated pricing is used where needed
Warning: built-in estimated pricing used for: gpt-5.4, gpt-5.5
By model:
gpt-5.5: $12.34 (84 turns, 1,234,567 tokens, built-in estimate)
Estimated only. Calculated from local session tokens + built-in pricing and/or local overrides. Not official billing.
```

Disclaimer:

- Estimated cost uses local Codex session tokens plus built-in estimated pricing and optional local overrides.
- It is not official OpenAI billing.
- Built-in pricing is an estimate and may lag actual billing changes.
- If a model appears in local history without a matching built-in estimate or manual override, `codex-meter cost` fails instead of guessing.

## Doctor

`codex-meter doctor` checks:

- auth file presence
- access token presence
- timezone validity
- pricing file presence at default path
- usage cache state
- app-server reachability
- reset-credit endpoint reachability when auth is available

## Development

```bash
npm run lint
npm test
npm run build
```

No runtime dependencies.
