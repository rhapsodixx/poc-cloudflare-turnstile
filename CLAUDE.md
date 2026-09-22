# PoC — Cloudflare Turnstile on an OTP request form

Proof of concept that puts Cloudflare Turnstile in front of a single-field
"request OTP" form (phone number) and proves, case by case, that the CAPTCHA,
phone validation and rate limiting behave correctly. The site is a showcase for
other teams: a sidebar lists every simulation case and runs it live.

## Session roles (hard rule)

Work is split across three named Claude Code sessions. Check the session name
before acting (`ListAgents` prints "This session is <name>").

| Session    | Allowed                                                       | Forbidden                          |
|------------|---------------------------------------------------------------|------------------------------------|
| `thinker`  | brainstorming, ideation, design specs, this file              | plans, code, scaffolding, deploys  |
| `planner`  | turning an approved spec into an implementation plan          | brainstorming, code, deploys       |
| `executor` | executing an approved plan: code, tests, deploys, commits     | brainstorming, re-planning         |

Artifacts and where they live:

- Specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (thinker)
- Plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md` (planner)
- Code, tests, deploy config: repo root (executor)

If you are in the wrong session for the task, stop and say which session should
do it. Do not "just do it here".

### Handoff protocol

Handoff is automatic only when BOTH hold: auto mode is on in the current session,
AND the target session appears in `ListAgents` as idle. Otherwise, print the
handoff message and let the human paste it.

1. `thinker` → `planner`: after the human approves a spec, send
   `SendMessage({to: "planner", message: "Spec approved: <path>. Write the implementation plan."})`
2. `planner` → `executor`: after the human approves a plan, send
   `SendMessage({to: "executor", message: "Plan approved: <path>. Execute it."})`
3. `executor` → `thinker`: only when execution surfaces a design question.
   Send the question; do not redesign in place.

Human approval is never skipped by auto mode. Auto mode only skips the
copy-paste between sessions.

## Tech stack

- Runtime / package manager / test runner: **Bun** (`bun install`, `bun test`, `bunx`)
- Frontend: **SvelteKit (Svelte 5)** + **shadcn-svelte** (see spec for why Svelte over Vue)
- API: SvelteKit `+server.ts` routes in the same app (no separate Worker)
- CAPTCHA: Cloudflare Turnstile, server-side `siteverify`, Turnstile **test
  sitekeys** for simulation cases
- State (rate limits, OTP idempotency): Cloudflare **KV** binding
- Hosting: **Cloudflare Pages** via `@sveltejs/adapter-cloudflare`
- E2E tests: **Playwright**; unit tests: `bun test`

## Tooling

- Cloudflare: **no Cloudflare MCP is configured** in this environment. Use
  `bunx wrangler` (wrangler is not installed globally) and load the `wrangler`
  / `cloudflare` skills before running it. If a Cloudflare MCP is added later,
  prefer it for Pages project, KV namespace and secret management.
- UI components: search the 21st.dev catalog first via the `21st` MCP
  (`mcp__plugin_21st_21st__search`) or `21st` CLI. Catalog items are React;
  port to Svelte by hand and keep shadcn-svelte tokens.
  The `@21st-dev/magic` server needs a fresh API key and is currently down.
- Svelte: always run the Svelte MCP autofixer on changed `.svelte` files.
- Docs lookup: Context7 MCP before relying on memory for SvelteKit, Turnstile,
  Playwright or wrangler APIs.

## Running

```bash
bun install
bun run dev                 # SvelteKit dev server with Turnstile test keys
bun test                    # unit tests (phone validation, rate limiter)
bunx playwright test        # E2E simulation cases against the dev server
bunx wrangler pages deploy  # deploy (executor only)
```

Secrets: copy `.env.example` to `.env` locally (git-ignored). In production set the same
names as Pages environment variables / secrets; adapter-cloudflare exposes them via `$env/dynamic/private`. Never commit `.env`. Remote: github.com/rhapsodixx/poc-cloudflare-turnstile.

## Conventions

- Commit messages: Conventional Commits.
- Keep it PoC-sized: one app, one KV namespace, no auth, no real SMS provider
  unless the spec says otherwise.
- Every simulation case in the sidebar must have a matching Playwright test,
  except cases flagged `manual` in `src/lib/cases.ts` (human click or production keys).
