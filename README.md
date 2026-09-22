# PoC — Cloudflare Turnstile on an OTP request form

A single-field "request OTP" form behind Cloudflare Turnstile, with Indonesian
phone validation and KV-backed rate limiting. The sidebar lists every simulation
case and runs it live against the real Cloudflare siteverify API using
Cloudflare's documented test keys.

Deployed: https://poc-cloudflare-turnstile.pages.dev

## Run it

```bash
bun install
cp .env.example .env
bun run dev          # http://localhost:5173
```

## Test it

```bash
bun run test:unit    # phone normalisation, rate limiter, siteverify client
bun run test:e2e     # one Playwright test per automatable case
bun run smoke        # curl the non-browser branches of the API
```

`BASE_URL=https://poc-cloudflare-turnstile.pages.dev bun run smoke` runs the
same checks against the deployment.

## Cases

`src/lib/cases.ts` is the single source of truth. The sidebar, the API's secret
selection and the Playwright suite all read it, so a case cannot exist without a
test. Two cases are `manual`: `interactive` needs a human to solve a challenge,
and `real-keys` needs production Turnstile keys plus a deployment.

## How a request is checked

`POST /api/otp/request` runs a fixed pipeline, first failure wins:

1. parse the body and resolve the simulation case — `400 bad-request`
2. normalise and validate the phone (Indonesia only) — `422 invalid-phone`
3. require a Turnstile token — `400 missing-token`
4. verify with Cloudflare siteverify — `403` with the Turnstile error code
5. rate limit per phone, then per IP — `429 rate-limited` with `Retry-After`
6. mock the send and return an `otpId` with the phone masked

Verification runs before rate limiting on purpose: otherwise anyone could
exhaust a victim's phone quota without solving a challenge.

## Deploy

```bash
bunx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name poc-cloudflare-turnstile
bun run deploy
```

`wrangler.toml` is the source of truth for project config; the KV namespace and
non-secret variables live there, not in the dashboard.

The deployed site's `TURNSTILE_SECRET_KEY` is currently set to Cloudflare's
documented always-pass test secret (`1x0000000000000000000000000000000AA`), so
every non-`real-keys` case works against the live URL. `real-keys` stays red
until a human supplies a real production Turnstile sitekey/secret pair and
updates `PUBLIC_TURNSTILE_SITEKEY` in `wrangler.toml` plus the
`TURNSTILE_SECRET_KEY` secret — and adds the deployed Pages hostname to that
widget's allowed domains in the Cloudflare dashboard (dashboard-only setting,
no wrangler equivalent).

## Known limits

- The rate limiter uses KV `get` + `put`, which is not atomic and is eventually
  consistent — a concurrent burst can let one extra request through. Fine for a
  PoC; a Durable Object per key is the upgrade path.
- KV's `list()` operation (used by the sidebar's per-case reset button) lags
  behind `put`/`delete` more than plain `get` does on real, deployed KV — a
  reset immediately followed by a request can still see the pre-reset count
  for a short window. Local `wrangler pages dev`/`vite dev` simulate KV with
  immediate consistency, so this only shows up against the real deployment;
  retrying after a few seconds clears it. Same root cause and upgrade path as
  the point above.
- OTP delivery is mocked (`console.log`); there is no verification step.
- Token expiry (300 s) is not simulated live — it surfaces as
  `timeout-or-duplicate`, which the `token-replay` case already covers.
- `OtpForm.svelte` has a parked hydration-race bug (flagged in Task 9's
  review): a fast click during the SSR→hydrate gap can fall through to a
  native form GET before Svelte's submit handler attaches, reverting the page
  to the wrong case. Real but non-blocking for this PoC; worth fixing before
  a live demo.
