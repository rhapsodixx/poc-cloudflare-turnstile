# Cloudflare Turnstile OTP-request PoC — Design

Status: approved in the `thinker` session on 2026-09-22.
Next step: `planner` session writes `docs/superpowers/plans/2026-09-22-turnstile-otp-poc-plan.md`.

## 1. Goal

Prove that Cloudflare Turnstile, phone validation and rate limiting protect a
single-field "request OTP" form, and make every behaviour demonstrable to other
teams through a sidebar of simulation cases that run live. OTP delivery is
mocked. Phone scope is Indonesia only.

Success criteria:

- Every case in the sidebar (section 4) produces its expected result on the
  deployed Pages site and on `bun run dev`.
- Every automatable case has a passing Playwright test driven from the same
  case table the sidebar renders.
- `bun test` covers phone normalisation, the rate limiter and the siteverify
  client.

Out of scope: real SMS, the OTP verification step, international numbers,
run-history persistence, authentication, a "run all" button in the UI.

## 2. Architecture

One SvelteKit (Svelte 5) app deployed to Cloudflare Pages with
`@sveltejs/adapter-cloudflare`. The API is one server route in the same app.
State is one KV namespace (`RATE_LIMIT`). No separate Worker, no database.

```
browser ── GET /            ── SvelteKit page: sidebar + form + result panel
        ── POST /api/otp/request ── +server.ts ── siteverify (Cloudflare)
                                              ── KV RATE_LIMIT (counters)
```

Configuration comes from `.env` locally (git-ignored; `.env.example` committed)
and from Pages environment variables/secrets in production, read through
SvelteKit `$env/dynamic/private` and `$env/dynamic/public`:

| Variable                  | Default (test)                        | Purpose                                   |
|---------------------------|---------------------------------------|-------------------------------------------|
| `PUBLIC_TURNSTILE_SITEKEY`| `1x00000000000000000000AA`            | sitekey for the `real-keys` case          |
| `TURNSTILE_SECRET_KEY`    | `1x0000000000000000000000000000000AA` | secret for the `real-keys` case           |
| `RATE_LIMIT_WINDOW`       | `600`                                 | seconds                                   |
| `RATE_LIMIT_PER_PHONE`    | `3`                                   | requests per phone per window             |
| `RATE_LIMIT_PER_IP`       | `10`                                  | requests per IP per window                |

Local development: `bun run dev` (Vite). The adapter's `platformProxy` option
emulates the KV binding so no `wrangler pages dev` step is needed. Deploy with
`bunx wrangler pages deploy` (wrangler is not installed globally).

Repository: `github.com/rhapsodixx/poc-cloudflare-turnstile`, branch `main`.

### Layout

```
src/lib/cases.ts                     shared case table (client + server + tests)
src/lib/server/phone.ts              normalise + validate Indonesian numbers
src/lib/server/turnstile.ts          siteverify client
src/lib/server/ratelimit.ts          KV counter
src/lib/components/Turnstile.svelte  explicit-render widget wrapper
src/lib/components/OtpForm.svelte    phone field + widget + submit
src/lib/components/ResultPanel.svelte
src/lib/components/ui/               shadcn-svelte generated components
src/routes/+layout.svelte            shadcn-svelte Sidebar block
src/routes/+page.svelte              case card + form + result
src/routes/api/otp/request/+server.ts
tests/unit/*.test.ts                 bun test
tests/e2e/cases.spec.ts              Playwright, one test per case
wrangler.toml                        Pages project + KV binding
```

## 3. Simulation mechanism

`src/lib/cases.ts` exports one array. Each entry:

```ts
{
  id: 'server-rejects',            // sidebar key, request body field, test name
  group: 'Turnstile' | 'Validation' | 'Rate limit' | 'Production',
  title: string,
  description: string,             // what the case proves, shown in the card
  sitekey: string | 'ENV',         // client renders the widget with this
  secretRef: 'pass' | 'fail' | 'spent' | 'ENV',
  phone?: string,                  // prefilled phone, e.g. an invalid one
  sendToken: boolean,              // false for missing-token
  repeat?: number,                 // fire N requests, assert on the last
  expected: { status: number; errorCode?: string; widgetError?: boolean },
  manual?: boolean,                // excluded from Playwright
}
```

The client renders the Turnstile widget with `sitekey` and sends
`{ phone, token, simCase: id }`. The server looks up `simCase` in the same table
and resolves `secretRef` to a secret:

| secretRef | Secret used                             |
|-----------|-----------------------------------------|
| `pass`    | `1x0000000000000000000000000000000AA`   |
| `fail`    | `2x0000000000000000000000000000000AA`   |
| `spent`   | `3x0000000000000000000000000000000AA`   |
| `ENV`     | `TURNSTILE_SECRET_KEY`                  |

Unknown `simCase` → 400. Test secrets only accept dummy tokens and the real
secret rejects dummy tokens, so cases cannot leak into each other. The test
secret values are public Cloudflare documentation values, safe in source.

Because the test sitekey drives the client and the test secret drives the
server, the same table also drives the Playwright tests: a case cannot exist
without a test.

## 4. Case matrix

| Group      | id               | sitekey / secretRef        | Expected                                             |
|------------|------------------|----------------------------|------------------------------------------------------|
| Turnstile  | `pass-visible`   | `1x…AA` / pass             | 200, `{ ok, otpId, phone: "+62812***4567" }`         |
| Turnstile  | `pass-invisible` | `1x…BB` / pass             | 200                                                  |
| Turnstile  | `widget-blocks`  | `2x…AB` / pass             | widget `error-callback` fires; no request sent       |
| Turnstile  | `interactive`    | `3x…FF` / pass             | 200 after the human completes the challenge (manual) |
| Turnstile  | `server-rejects` | `1x…AA` / fail             | 403, `invalid-input-response`                        |
| Turnstile  | `token-replay`   | `1x…AA` / spent            | 403, `timeout-or-duplicate`                          |
| Turnstile  | `missing-token`  | `1x…AA`, sendToken=false   | 400, `missing-token`                                 |
| Validation | `invalid-phone`  | `1x…AA` / pass, phone=`12` | 422, `invalid-phone`; siteverify never called        |
| Rate limit | `per-phone`      | `1x…AA` / pass, repeat=4   | last request 429, `Retry-After` header               |
| Rate limit | `per-ip`         | `1x…AA` / pass, repeat=11, phone varies | last request 429                        |
| Production | `real-keys`      | ENV / ENV                  | 200 with real keys; hostname and action verified (manual) |

Full sitekeys: `1x00000000000000000000AA`, `1x00000000000000000000BB`,
`2x00000000000000000000AB`, `3x00000000000000000000FF`.

The `per-ip` case sends a different valid phone each time so it does not trip
the per-phone limit first. Rate-limit cases use a KV key prefix that includes
the case id so repeated demo runs of other cases do not consume the quota; the
result panel shows the remaining quota and a "reset" link that deletes the
case's keys (server route `POST /api/sim/reset`, only for keys under the sim
prefix).

Token expiry (300 s) is not simulated live; it surfaces as
`timeout-or-duplicate`, which `token-replay` already covers.

## 5. API

`POST /api/otp/request`, JSON body `{ phone: string, token?: string, simCase: string }`.

Pipeline, in order, first failure wins:

1. Parse JSON and resolve `simCase` → else 400 `bad-request`.
2. Normalise phone: strip spaces/dashes, `08xx` → `+628xx`, `62…` → `+62…`.
   Valid = `+628` followed by 8–11 digits. Else 422 `invalid-phone`.
3. `token` present → else 400 `missing-token`.
4. siteverify: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`
   with `secret`, `response`, `remoteip` (from `CF-Connecting-IP`), and a
   generated UUID `idempotency_key`. One retry with the same key on
   `internal-error` or network failure. `success: false` → 403 with the first
   `error-codes` entry. For `secretRef === 'ENV'` additionally require
   `action === 'request-otp'` and `hostname` equal to the request host → else
   403 `action-mismatch` / `hostname-mismatch`.
5. Rate limit: increment `rl:<case>:phone:<e164>` then `rl:<case>:ip:<ip>` in
   KV with `expirationTtl = RATE_LIMIT_WINDOW`. Over limit → 429 with
   `Retry-After` and `{ error: 'rate-limited', scope: 'phone' | 'ip' }`.
6. Mock send: `console.log` the event; return 200
   `{ ok: true, otpId: crypto.randomUUID(), phone: masked, expiresIn: 300 }`.

Siteverify runs before rate limiting so that nobody can exhaust a victim's
phone quota without solving a challenge. Rate limiting counts every verified
attempt.

Error body shape everywhere: `{ ok: false, error: string, detail?: string[] }`.
The result panel renders status, body, elapsed ms and the raw siteverify
`error-codes` when present.

KV `get` + `put` is not atomic and is eventually consistent. Accepted for a
PoC; the rate limiter carries a `ponytail:` comment naming Durable Objects as
the upgrade path.

## 6. UI

- shadcn-svelte **Sidebar** block: cases grouped by `group`, active case
  highlighted, manual cases marked with a badge.
- Main panel, top to bottom: case card (title, description, expected result as
  a status badge), `OtpForm` (phone input prefilled from the case, Turnstile
  widget, submit button, loading state), `ResultPanel` (status badge, JSON
  body, siteverify error codes, elapsed time, remaining quota + reset for
  rate-limit cases).
- `Turnstile.svelte`: loads `api.js?render=explicit` once, calls
  `turnstile.render` with `{ sitekey, action: 'request-otp', callback,
  'error-callback' }`, and on case change calls `turnstile.remove` then
  re-renders. Exposes the token via a bindable prop. No wrapper library.
- `widget-blocks` shows the error callback in the result panel instead of a
  server response.
- Components come from shadcn-svelte's registry (`sidebar`, `card`, `input`,
  `button`, `badge`). 21st.dev is searched for layout and result-panel
  inspiration only; anything used is ported to Svelte by hand.
- Dark and light theme via shadcn tokens; layout works at phone width with
  the sidebar collapsing to a sheet.

## 7. Testing

Unit (`bun test`, `tests/unit/`):

- `phone.test.ts`: normalisation table (08xx, 62xx, +62xx, spaces, dashes),
  rejects landlines, short and long numbers, non-Indonesian codes.
- `ratelimit.test.ts`: in-memory KV stub; N allowed, N+1 rejected, TTL passed
  through, phone and IP scopes independent.
- `turnstile.test.ts`: mocked `fetch`; success, `error-codes` propagation,
  one retry on `internal-error`, idempotency key reused on retry, action and
  hostname checks only for `ENV`.

E2E (`bunx playwright test`, `tests/e2e/cases.spec.ts`):

- Iterates `cases` where `manual !== true`. For each: navigate, click the
  sidebar item, fill phone (or accept the prefill), wait for the widget token
  (or skip when `sendToken` is false), submit `repeat` times, assert the result
  panel status and error code equal `expected`.
- `widget-blocks` asserts the error-callback message appears and no request
  to `/api/otp/request` was made.
- Runs against `bun run dev` via Playwright `webServer`; Turnstile test keys
  work on localhost. Each test resets its rate-limit keys first.

Manual: `interactive` (needs a human click) and `real-keys` (needs production
keys and a Pages deployment).

## 8. Deployment

- `bunx wrangler pages project create poc-cloudflare-turnstile`
- `bunx wrangler kv namespace create RATE_LIMIT` and bind it in `wrangler.toml`
- Set `TURNSTILE_SECRET_KEY` as a Pages secret, `PUBLIC_TURNSTILE_SITEKEY` and
  rate-limit knobs as Pages environment variables
- `bun run build && bunx wrangler pages deploy .svelte-kit/cloudflare`
- Turnstile widget for `real-keys` must list the Pages hostname in its
  allowed domains.

Cloudflare now steers new projects toward Workers with static assets. Pages is
used here because it was requested; the adapter output is the same, so a later
move is a config change.
