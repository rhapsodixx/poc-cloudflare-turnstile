# Cloudflare Turnstile OTP-request PoC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session rule (project-specific):** this plan is executed by the `executor` session only. See `CLAUDE.md`. If a step surfaces a *design* question (not a typo, not a version bump), stop and send it to `thinker`; do not redesign in place.

**Goal:** Ship a SvelteKit app on Cloudflare Pages where a sidebar of simulation cases proves, case by case, that Turnstile verification, Indonesian phone validation and KV rate limiting behave correctly in front of a mocked "request OTP" endpoint.

**Architecture:** One SvelteKit 2 / Svelte 5 app. A single shared case table (`src/lib/cases.ts`) drives three consumers: the sidebar UI, the server route's secret selection, and the Playwright suite — so a case cannot exist without a test. The API is one `+server.ts` route that runs a fixed pipeline (parse → phone → token → siteverify → rate limit → mock send), first failure wins. State is one KV namespace, emulated locally by the adapter's `platformProxy`.

**Tech Stack:** Bun 1.3, SvelteKit 2.70 (`@sveltejs/kit`), Svelte 5.57, `@sveltejs/adapter-cloudflare` 7.x, Tailwind CSS + shadcn-svelte 1.7, Cloudflare Turnstile (`api.js?render=explicit`), Cloudflare KV, Wrangler 4.x via `bunx`, Playwright 1.63, `bun test` for units.

**Spec:** `docs/superpowers/specs/2026-09-22-turnstile-otp-poc-design.md` — read it alongside this plan.

---

## Global Constraints

These apply to every task. Values are copied verbatim from the spec.

- **Package manager / runtime / unit test runner: Bun.** `bun install`, `bun run dev`, `bun test`. Never `npm`/`pnpm`/`yarn`.
- **Wrangler is NOT installed globally.** Always `bunx wrangler …`.
- **No Cloudflare MCP is configured.** All Cloudflare operations go through `bunx wrangler`. Load the `wrangler` / `cloudflare` skill before running wrangler commands.
- **Svelte MCP autofixer must be run on every changed `.svelte` file** (`mcp__plugin_svelte_svelte__svelte-autofixer`), and re-run until clean. Prefer the `svelte:svelte-file-editor` agent for `.svelte` work.
- **Context7 MCP before memory** for SvelteKit, Turnstile, Playwright, shadcn-svelte and wrangler APIs.
- **Turnstile test sitekeys** (public, safe in source): `1x00000000000000000000AA` (visible, passes), `1x00000000000000000000BB` (invisible, passes), `2x00000000000000000000AB` (visible, always fails), `3x00000000000000000000FF` (forces interactive challenge).
- **Turnstile test secret keys** (public, safe in source): `1x0000000000000000000000000000000AA` (pass), `2x0000000000000000000000000000000AA` (fail), `3x0000000000000000000000000000000AA` (token already spent).
- **Turnstile widget action is always `request-otp`.**
- **Phone scope is Indonesia only.** Valid E.164 = `+628` followed by 8–11 digits.
- **Env var names are fixed:** `PUBLIC_TURNSTILE_SITEKEY`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_WINDOW` (600), `RATE_LIMIT_PER_PHONE` (3), `RATE_LIMIT_PER_IP` (10). Read via `$env/dynamic/private` and `$env/dynamic/public` (never `$env/static/*` — Pages injects at runtime).
- **KV binding name is `RATE_LIMIT`.** One namespace only.
- **Error body shape everywhere:** `{ ok: false, error: string, detail?: string[] }`.
- **Never commit `.env`.** `.env.example` is already committed and is the source of truth for names.
- **Commit messages: Conventional Commits.** Commit at the end of every task; never leave a task half-committed.
- **Every non-`manual` case in `src/lib/cases.ts` must have a passing Playwright test.** The suite iterates the table, so this is enforced mechanically.
- **Repo:** `github.com/rhapsodixx/poc-cloudflare-turnstile`, branch `main`.

### Out of scope (do not build)

Real SMS delivery, the OTP *verification* step, non-Indonesian numbers, run-history persistence, authentication, a "run all" button.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `svelte.config.js` | SvelteKit config; `adapter-cloudflare` with `platformProxy` | 1 |
| `wrangler.toml` | Pages project name, `pages_build_output_dir`, compat flags, `RATE_LIMIT` KV binding | 1 |
| `src/app.d.ts` | `App.Platform.env` typing for the KV binding | 1 |
| `src/routes/api/health/+server.ts` | 6-line probe: is `RATE_LIMIT` bound? Used in dev *and* after deploy | 1 |
| `src/lib/cases.ts` | The single case table + types + lookup. No I/O, no imports. Shared by client, server and tests | 2 |
| `src/lib/server/phone.ts` | Normalise / validate / mask Indonesian numbers. Pure | 3 |
| `src/lib/server/ratelimit.ts` | KV counter: `hit`, key builders, `resetCase`. Takes a `KVNamespace`, never imports one | 4 |
| `src/lib/server/turnstile.ts` | `siteverify` client + retry + `checkClaims` + test-secret map | 5 |
| `src/routes/api/otp/request/+server.ts` | The pipeline. Wires 2–5. No business logic of its own | 6 |
| `src/routes/api/sim/reset/+server.ts` | Deletes only `rl:<case>:*` keys | 6 |
| `src/lib/components/ui/**` | shadcn-svelte generated (`sidebar`, `card`, `input`, `button`, `badge`) — do not hand-edit | 7 |
| `src/routes/+layout.svelte` | Sidebar shell; renders case groups; active case via URL `?case=` | 7 |
| `src/lib/components/CaseCard.svelte` | Title, description, expected-result badge | 7 |
| `src/lib/components/Turnstile.svelte` | Explicit-render widget wrapper; `bind:token`, `reset()` | 8 |
| `src/lib/components/OtpForm.svelte` | Phone input + widget + submit + repeat loop | 8 |
| `src/lib/components/ResultPanel.svelte` | Status badge, JSON body, error codes, elapsed ms, quota + reset | 8 |
| `src/routes/+page.svelte` | Composes CaseCard + OtpForm + ResultPanel for the active case | 8 |
| `tests/unit/*.test.ts` | `bun test` | 2–5 |
| `tests/e2e/cases.spec.ts` | Playwright, generated from `cases` | 9 |
| `README.md` | Run / test / deploy | 10 |

---

## Task 1: Scaffold the app with a working KV binding in dev

Nothing else can be tested until `platform.env.RATE_LIMIT` actually exists on a request in `bun run dev`. This task is done when that is proven, not when the scaffold exists.

**Files:**
- Create: the SvelteKit scaffold (via `sv create`), `wrangler.toml`, `src/routes/api/health/+server.ts`
- Modify: `svelte.config.js`, `src/app.d.ts`, `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `App.Platform.env.RATE_LIMIT: KVNamespace`, available in every `+server.ts` as `event.platform?.env.RATE_LIMIT`. `GET /api/health` → `{ ok: true, kv: boolean }`.

- [ ] **Step 1: Scaffold into the existing (non-empty) repo**

The repo already holds `.git/`, `docs/`, `CLAUDE.md`, `.env`, `.env.example`, `.gitignore` — so `--no-dir-check` is required.

```bash
cd /Users/panji.gautama/Documents/Project/poc-turnstile-cloudflare
bunx sv@latest create . \
  --template minimal \
  --types ts \
  --no-dir-check \
  --no-download-check \
  --add tailwindcss="plugins:none" playwright sveltekit-adapter="adapter:cloudflare+cfTarget:pages" \
  --install bun
```

- [ ] **Step 2: Confirm the scaffold picked the Cloudflare adapter**

```bash
grep -n "adapter-cloudflare" svelte.config.js package.json
ls wrangler.jsonc wrangler.json wrangler.toml 2>/dev/null
```

Expected: `@sveltejs/adapter-cloudflare` imported in `svelte.config.js` and present in `devDependencies`. The add-on may have written `wrangler.jsonc` instead of `wrangler.toml`. **The spec names `wrangler.toml`; standardise on it** — delete any generated `wrangler.jsonc`/`wrangler.json` and write the TOML in Step 4.

- [ ] **Step 3: Enable the platform proxy so dev gets real local bindings**

`platformProxy` makes the adapter read `wrangler.toml` and populate `event.platform.env` during `vite dev` and `vite preview`.

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			config: './wrangler.toml',
			platformProxy: { persist: false }
		})
	}
};

export default config;
```

- [ ] **Step 4: Write `wrangler.toml`**

`pages_build_output_dir` is what makes wrangler treat this as a Pages project (required since Wrangler 3.45). `nodejs_als` is required by `adapter-cloudflare`. The KV `id` below is a placeholder — local KV is simulated by miniflare and ignores it; Task 10 replaces it with the real namespace id.

```toml
"$schema" = "./node_modules/wrangler/config-schema.json"
name = "poc-cloudflare-turnstile"
pages_build_output_dir = ".svelte-kit/cloudflare"
compatibility_date = "2026-09-22"
compatibility_flags = ["nodejs_als"]

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "PLACEHOLDER_REPLACED_IN_TASK_10"
```

- [ ] **Step 5: Type the binding**

`adapter-cloudflare` deliberately does **not** type `Platform.env` (it leaves that to you), so declare it:

```bash
bun add -D @cloudflare/workers-types
```

```ts
// src/app.d.ts
import type { KVNamespace } from '@cloudflare/workers-types';

declare global {
	namespace App {
		interface Platform {
			env: {
				RATE_LIMIT: KVNamespace;
			};
		}
	}
}

export {};
```

- [ ] **Step 6: Write the health probe**

```ts
// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ platform }) =>
	json({ ok: true, kv: Boolean(platform?.env?.RATE_LIMIT) });
```

- [ ] **Step 7: Add the scripts the rest of the plan relies on**

In `package.json` `"scripts"`, ensure exactly these exist (keep whatever `sv create` added for `dev`/`build`/`preview`/`check`):

```json
{
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "test:unit": "bun test tests/unit",
  "test:e2e": "playwright test",
  "deploy": "bun run build && bunx wrangler pages deploy"
}
```

- [ ] **Step 8: Prove the binding is live — this is the real acceptance check**

```bash
bun run dev &
sleep 6
curl -s http://localhost:5173/api/health
kill %1
```

Expected: `{"ok":true,"kv":true}`.

If `kv` is `false`: the adapter is not reading `wrangler.toml`. Check the `config` path in `svelte.config.js`, that `wrangler.toml` parses (`bunx wrangler pages download config --help` is not needed; `bunx wrangler types` will fail loudly on a malformed file), and that no stray `wrangler.jsonc` is shadowing it. **Do not proceed to Task 2 until this returns `true`** — every later task depends on it.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold SvelteKit app with Cloudflare adapter and KV binding"
```

---

## Task 2: The case table

This is the spine of the whole PoC. Three consumers read it, so it lands before any of them, and its unit test guards the invariants that keep the sidebar, the server and the Playwright suite in sync.

**Files:**
- Create: `src/lib/cases.ts`, `tests/unit/cases.test.ts`

**Interfaces:**
- Consumes: nothing (no imports — it must be safe to import from client, server and test code).
- Produces:
  - `type CaseGroup = 'Turnstile' | 'Validation' | 'Rate limit' | 'Production'`
  - `type SecretRef = 'pass' | 'fail' | 'spent' | 'ENV'`
  - `interface SimCase` (fields below)
  - `const DEFAULT_PHONE: string`
  - `const cases: SimCase[]`
  - `function findCase(id: string): SimCase | undefined`
  - `function groupedCases(): { group: CaseGroup; items: SimCase[] }[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/cases.test.ts
import { describe, expect, test } from 'bun:test';
import { cases, findCase, groupedCases, DEFAULT_PHONE } from '../../src/lib/cases';

const SITEKEYS = [
	'1x00000000000000000000AA',
	'1x00000000000000000000BB',
	'2x00000000000000000000AB',
	'3x00000000000000000000FF',
	'ENV'
];

describe('cases table', () => {
	test('ids are unique and kebab-case', () => {
		const ids = cases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
	});

	test('covers every case named in the spec', () => {
		expect(cases.map((c) => c.id).sort()).toEqual(
			[
				'interactive',
				'invalid-phone',
				'missing-token',
				'pass-invisible',
				'pass-visible',
				'per-ip',
				'per-phone',
				'real-keys',
				'server-rejects',
				'token-replay',
				'widget-blocks'
			].sort()
		);
	});

	test('every sitekey is a documented test key or ENV', () => {
		for (const c of cases) expect(SITEKEYS).toContain(c.sitekey);
	});

	test('automatable cases declare an expected outcome the E2E suite can assert', () => {
		for (const c of cases.filter((c) => !c.manual)) {
			const hasOutcome = typeof c.expected.status === 'number' || c.expected.widgetError === true;
			expect(hasOutcome).toBe(true);
		}
	});

	test('only the Production case uses ENV', () => {
		for (const c of cases) {
			expect(c.secretRef === 'ENV').toBe(c.sitekey === 'ENV');
			if (c.secretRef === 'ENV') expect(c.group).toBe('Production');
		}
	});

	test('repeat cases repeat more than their limit implies', () => {
		expect(findCase('per-phone')?.repeat).toBe(4);
		expect(findCase('per-ip')?.repeat).toBe(11);
		expect(findCase('per-ip')?.varyPhone).toBe(true);
	});

	test('findCase returns undefined for unknown ids', () => {
		expect(findCase('does-not-exist')).toBeUndefined();
	});

	test('groupedCases preserves spec order and loses nothing', () => {
		const grouped = groupedCases();
		expect(grouped.map((g) => g.group)).toEqual([
			'Turnstile',
			'Validation',
			'Rate limit',
			'Production'
		]);
		expect(grouped.flatMap((g) => g.items).length).toBe(cases.length);
	});

	test('DEFAULT_PHONE is an Indonesian mobile number', () => {
		expect(DEFAULT_PHONE).toMatch(/^08\d{8,11}$/);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/unit/cases.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/cases'`.

- [ ] **Step 3: Write the table**

```ts
// src/lib/cases.ts
// The single source of truth for simulation cases. Imported by the sidebar,
// the API route and the Playwright suite — so a case cannot exist without a test.
// Keep this file free of imports and side effects.

export type CaseGroup = 'Turnstile' | 'Validation' | 'Rate limit' | 'Production';

/** Which secret the server resolves for this case. Maps to TEST_SECRETS in src/lib/server/turnstile.ts. */
export type SecretRef = 'pass' | 'fail' | 'spent' | 'ENV';

export interface SimCase {
	/** Sidebar key, request body field, and Playwright test name. */
	id: string;
	group: CaseGroup;
	title: string;
	/** What the case proves. Rendered in the case card. */
	description: string;
	/** Sitekey the client renders the widget with, or 'ENV' for PUBLIC_TURNSTILE_SITEKEY. */
	sitekey: string;
	secretRef: SecretRef;
	/** Prefilled phone. Falls back to DEFAULT_PHONE. */
	phone?: string;
	/** false → the client submits without a token, to exercise the missing-token branch. */
	sendToken: boolean;
	/** Fire N requests; assert on the last one. */
	repeat?: number;
	/** Use a different valid phone on each repeat, so the per-phone limit does not trip first. */
	varyPhone?: boolean;
	expected: {
		/** Absent only when the request never leaves the browser (widgetError). */
		status?: number;
		/** Value of `error` in the response body. */
		errorCode?: string;
		/** The Turnstile widget's error-callback fires and no request is sent. */
		widgetError?: boolean;
	};
	/** Excluded from Playwright: needs a human or production keys. */
	manual?: boolean;
}

export const DEFAULT_PHONE = '081234567890';

const PASS_VISIBLE = '1x00000000000000000000AA';
const PASS_INVISIBLE = '1x00000000000000000000BB';
const FAIL_VISIBLE = '2x00000000000000000000AB';
const INTERACTIVE = '3x00000000000000000000FF';

export const cases: SimCase[] = [
	{
		id: 'pass-visible',
		group: 'Turnstile',
		title: 'Visible widget, valid token',
		description:
			'The happy path. A visible widget solves silently, the server verifies the token against a passing secret and returns a mocked OTP id with the phone masked.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 }
	},
	{
		id: 'pass-invisible',
		group: 'Turnstile',
		title: 'Invisible widget, valid token',
		description:
			'Same outcome with no visible challenge, proving the invisible widget type is wired correctly and yields a token the server accepts.',
		sitekey: PASS_INVISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 }
	},
	{
		id: 'widget-blocks',
		group: 'Turnstile',
		title: 'Widget refuses to issue a token',
		description:
			'An always-failing sitekey makes the widget fire its error-callback. The form never reaches the server — the browser is the first line of defence.',
		sitekey: FAIL_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		expected: { widgetError: true }
	},
	{
		id: 'interactive',
		group: 'Turnstile',
		title: 'Interactive challenge',
		description:
			'Forces a challenge a human must complete. Proves the flow survives a real interaction. Run this one by hand.',
		sitekey: INTERACTIVE,
		secretRef: 'pass',
		sendToken: true,
		expected: { status: 200 },
		manual: true
	},
	{
		id: 'server-rejects',
		group: 'Turnstile',
		title: 'Server rejects a token the widget accepted',
		description:
			'The widget hands over a token, but siteverify runs against an always-failing secret. Proves the server is the authority, not the client.',
		sitekey: PASS_VISIBLE,
		secretRef: 'fail',
		sendToken: true,
		expected: { status: 403, errorCode: 'invalid-input-response' }
	},
	{
		id: 'token-replay',
		group: 'Turnstile',
		title: 'Token replay',
		description:
			'Verifies against the "token already spent" secret. Proves a captured token cannot be redeemed twice.',
		sitekey: PASS_VISIBLE,
		secretRef: 'spent',
		sendToken: true,
		expected: { status: 403, errorCode: 'timeout-or-duplicate' }
	},
	{
		id: 'missing-token',
		group: 'Turnstile',
		title: 'No token at all',
		description:
			'The client submits with the token stripped, as a scripted client would. The server refuses before it ever calls siteverify.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: false,
		expected: { status: 400, errorCode: 'missing-token' }
	},
	{
		id: 'invalid-phone',
		group: 'Validation',
		title: 'Malformed phone number',
		description:
			'Phone validation runs before siteverify, so garbage input costs nothing. Proves we do not spend a Cloudflare call on an obviously bad request.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		phone: '12',
		sendToken: true,
		expected: { status: 422, errorCode: 'invalid-phone' }
	},
	{
		id: 'per-phone',
		group: 'Rate limit',
		title: 'Per-phone limit',
		description:
			'Four verified requests for one number against a limit of three. The fourth is refused with a Retry-After header — one phone cannot be spammed with OTPs.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		repeat: 4,
		expected: { status: 429, errorCode: 'rate-limited' }
	},
	{
		id: 'per-ip',
		group: 'Rate limit',
		title: 'Per-IP limit',
		description:
			'Eleven verified requests from one IP, each for a different number, against a limit of ten. Proves one client cannot fan out across many victims.',
		sitekey: PASS_VISIBLE,
		secretRef: 'pass',
		sendToken: true,
		repeat: 11,
		varyPhone: true,
		expected: { status: 429, errorCode: 'rate-limited' }
	},
	{
		id: 'real-keys',
		group: 'Production',
		title: 'Real keys, real checks',
		description:
			'Uses the production sitekey and secret from the environment, and additionally requires the token to carry action "request-otp" and the deployed hostname. Needs a deployment and real keys.',
		sitekey: 'ENV',
		secretRef: 'ENV',
		sendToken: true,
		expected: { status: 200 },
		manual: true
	}
];

const GROUP_ORDER: CaseGroup[] = ['Turnstile', 'Validation', 'Rate limit', 'Production'];

export function findCase(id: string): SimCase | undefined {
	return cases.find((c) => c.id === id);
}

export function groupedCases(): { group: CaseGroup; items: SimCase[] }[] {
	return GROUP_ORDER.map((group) => ({
		group,
		items: cases.filter((c) => c.group === group)
	})).filter((g) => g.items.length > 0);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/unit/cases.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cases.ts tests/unit/cases.test.ts
git commit -m "feat: add simulation case table shared by UI, API and tests"
```

---

## Task 3: Indonesian phone normalisation

Pure functions, no I/O. Written first among the server modules because the pipeline rejects bad phones before spending a Cloudflare call.

**Files:**
- Create: `src/lib/server/phone.ts`, `tests/unit/phone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function normalisePhone(input: string): string` — best-effort E.164 string, no validation
  - `type PhoneResult = { ok: true; e164: string } | { ok: false }`
  - `function validatePhone(input: string): PhoneResult`
  - `function maskPhone(e164: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/phone.test.ts
import { describe, expect, test } from 'bun:test';
import { maskPhone, normalisePhone, validatePhone } from '../../src/lib/server/phone';

describe('normalisePhone', () => {
	const table: [string, string][] = [
		['081234567890', '+6281234567890'],
		['6281234567890', '+6281234567890'],
		['+6281234567890', '+6281234567890'],
		['0812 3456 7890', '+6281234567890'],
		['0812-3456-7890', '+6281234567890'],
		['+62 812-3456-7890', '+6281234567890'],
		['(0812) 3456 7890', '+6281234567890']
	];

	for (const [input, expected] of table) {
		test(`${input} -> ${expected}`, () => {
			expect(normalisePhone(input)).toBe(expected);
		});
	}
});

describe('validatePhone', () => {
	test('accepts the shortest and longest Indonesian mobile numbers', () => {
		// +628 followed by 8 digits, and +628 followed by 11 digits
		expect(validatePhone('08123456789')).toEqual({ ok: true, e164: '+628123456789' });
		expect(validatePhone('081234567890123')).toEqual({ ok: true, e164: '+6281234567890123' });
	});

	test('rejects too short and too long', () => {
		expect(validatePhone('0812345678').ok).toBe(true); // 8 digits after +628 boundary check
		expect(validatePhone('12').ok).toBe(false);
		expect(validatePhone('0812').ok).toBe(false);
		expect(validatePhone('0812345678901234').ok).toBe(false);
	});

	test('rejects Indonesian landlines', () => {
		expect(validatePhone('0215551234').ok).toBe(false); // Jakarta
		expect(validatePhone('+62215551234').ok).toBe(false);
	});

	test('rejects non-Indonesian country codes', () => {
		expect(validatePhone('+6591234567').ok).toBe(false); // Singapore
		expect(validatePhone('+14155552671').ok).toBe(false); // US
	});

	test('rejects letters and empty input', () => {
		expect(validatePhone('').ok).toBe(false);
		expect(validatePhone('08tigaempat').ok).toBe(false);
	});
});

describe('maskPhone', () => {
	test('keeps the country code and prefix plus the last four digits', () => {
		expect(maskPhone('+6281234567890')).toBe('+62812***7890');
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/unit/phone.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/server/phone'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/server/phone.ts
// Indonesia only, by design. See the spec: international numbers are out of scope.

/** +628 followed by 8-11 more digits. Mobile prefixes only; landlines (+6221, ...) fail. */
const INDONESIAN_MOBILE = /^\+628\d{8,11}$/;

/** Strips formatting and rewrites the local/national prefix to E.164. Does not validate. */
export function normalisePhone(input: string): string {
	const cleaned = input.replace(/[\s()‐-―-]/g, '');
	if (cleaned.startsWith('+62')) return cleaned;
	if (cleaned.startsWith('62')) return `+${cleaned}`;
	if (cleaned.startsWith('0')) return `+62${cleaned.slice(1)}`;
	return cleaned;
}

export type PhoneResult = { ok: true; e164: string } | { ok: false };

export function validatePhone(input: string): PhoneResult {
	const e164 = normalisePhone(input);
	return INDONESIAN_MOBILE.test(e164) ? { ok: true, e164 } : { ok: false };
}

/** +6281234567890 -> +62812***7890. Never log or return an unmasked number. */
export function maskPhone(e164: string): string {
	return `${e164.slice(0, 6)}***${e164.slice(-4)}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/unit/phone.test.ts`
Expected: PASS.

If `validatePhone('0812345678')` disagrees with the test, count the digits by hand against `^\+628\d{8,11}$` and fix the *test's* expectation, not the regex — the regex is the spec's rule verbatim.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/phone.ts tests/unit/phone.test.ts
git commit -m "feat: normalise and validate Indonesian mobile numbers"
```

---

## Task 4: KV rate limiter

Takes a `KVNamespace` as an argument and never imports one, so it is testable with a plain in-memory stub.

**Files:**
- Create: `src/lib/server/ratelimit.ts`, `tests/unit/ratelimit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface KVLike` — the three KV methods this module uses
  - `interface RateLimitConfig { window: number; limit: number }`
  - `interface RateLimitResult { allowed: boolean; count: number; remaining: number; retryAfter: number }`
  - `function phoneKey(caseId: string, e164: string): string`
  - `function ipKey(caseId: string, ip: string): string`
  - `function casePrefix(caseId: string): string`
  - `function hit(kv: KVLike, key: string, config: RateLimitConfig): Promise<RateLimitResult>`
  - `function resetCase(kv: KVLike, caseId: string): Promise<number>` — returns how many keys were deleted

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ratelimit.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import {
	casePrefix,
	hit,
	ipKey,
	phoneKey,
	resetCase,
	type KVLike
} from '../../src/lib/server/ratelimit';

/** Minimal in-memory stand-in for a KV namespace. Records the TTLs it was given. */
function makeKv() {
	const store = new Map<string, string>();
	const ttls: number[] = [];
	const kv: KVLike = {
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value, options) {
			if (options?.expirationTtl !== undefined) ttls.push(options.expirationTtl);
			store.set(key, value);
		},
		async list({ prefix }) {
			return {
				keys: [...store.keys()]
					.filter((k) => k.startsWith(prefix))
					.map((name) => ({ name }))
			};
		},
		async delete(key) {
			store.delete(key);
		}
	};
	return { kv, store, ttls };
}

const config = { window: 600, limit: 3 };

describe('key builders', () => {
	test('namespace keys by case so demo runs do not interfere', () => {
		expect(phoneKey('per-phone', '+6281234567890')).toBe('rl:per-phone:phone:+6281234567890');
		expect(ipKey('per-ip', '1.2.3.4')).toBe('rl:per-ip:ip:1.2.3.4');
		expect(casePrefix('per-ip')).toBe('rl:per-ip:');
	});
});

describe('hit', () => {
	let kv: KVLike;
	let ttls: number[];

	beforeEach(() => {
		const made = makeKv();
		kv = made.kv;
		ttls = made.ttls;
	});

	test('allows exactly `limit` requests, then refuses', async () => {
		const key = phoneKey('per-phone', '+6281234567890');
		const results = [];
		for (let i = 0; i < 4; i++) results.push(await hit(kv, key, config));

		expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
		expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
		expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
	});

	test('passes the window through as the TTL and as retryAfter', async () => {
		const result = await hit(kv, phoneKey('per-phone', '+628111'), config);
		expect(ttls).toEqual([600]);
		expect(result.retryAfter).toBe(600);
	});

	test('phone and IP scopes count independently', async () => {
		const p = phoneKey('per-ip', '+628111');
		const i = ipKey('per-ip', '1.2.3.4');
		await hit(kv, p, config);
		await hit(kv, p, config);
		const ipResult = await hit(kv, i, config);
		expect(ipResult.count).toBe(1);
	});

	test('cases count independently', async () => {
		await hit(kv, phoneKey('per-phone', '+628111'), config);
		const other = await hit(kv, phoneKey('pass-visible', '+628111'), config);
		expect(other.count).toBe(1);
	});
});

describe('resetCase', () => {
	test('deletes only the keys belonging to that case', async () => {
		const { kv, store } = makeKv();
		await hit(kv, phoneKey('per-phone', '+628111'), config);
		await hit(kv, ipKey('per-phone', '1.2.3.4'), config);
		await hit(kv, phoneKey('per-ip', '+628222'), config);

		const deleted = await resetCase(kv, 'per-phone');

		expect(deleted).toBe(2);
		expect([...store.keys()]).toEqual(['rl:per-ip:phone:+628222']);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/unit/ratelimit.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/server/ratelimit'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/server/ratelimit.ts

/**
 * The slice of KVNamespace this module needs. Declaring it locally keeps the
 * module testable with a plain Map and free of @cloudflare/workers-types at runtime.
 */
export interface KVLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
	delete(key: string): Promise<void>;
}

export interface RateLimitConfig {
	/** Seconds. Also the KV expirationTtl and the Retry-After value. */
	window: number;
	limit: number;
}

export interface RateLimitResult {
	allowed: boolean;
	count: number;
	remaining: number;
	retryAfter: number;
}

/** Keys are namespaced by case id so demoing one case never eats another's quota. */
export const casePrefix = (caseId: string) => `rl:${caseId}:`;
export const phoneKey = (caseId: string, e164: string) => `${casePrefix(caseId)}phone:${e164}`;
export const ipKey = (caseId: string, ip: string) => `${casePrefix(caseId)}ip:${ip}`;

/**
 * Increment one counter and report whether the caller is still under the limit.
 *
 * ponytail: get-then-put is not atomic and KV is eventually consistent, so two
 * simultaneous requests can both read the same count and one extra request can
 * slip through. Accepted for a PoC. Upgrade path: a Durable Object per key,
 * which serialises the increment.
 */
export async function hit(
	kv: KVLike,
	key: string,
	config: RateLimitConfig
): Promise<RateLimitResult> {
	const previous = Number((await kv.get(key)) ?? 0);
	const count = previous + 1;
	// KV enforces a 60-second minimum TTL; RATE_LIMIT_WINDOW defaults to 600.
	await kv.put(key, String(count), { expirationTtl: Math.max(60, config.window) });

	return {
		allowed: count <= config.limit,
		count,
		remaining: Math.max(0, config.limit - count),
		retryAfter: config.window
	};
}

/** Deletes every counter for one case. Never touches keys outside `rl:<caseId>:`. */
export async function resetCase(kv: KVLike, caseId: string): Promise<number> {
	const { keys } = await kv.list({ prefix: casePrefix(caseId) });
	await Promise.all(keys.map((k) => kv.delete(k.name)));
	return keys.length;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/unit/ratelimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/ratelimit.ts tests/unit/ratelimit.test.ts
git commit -m "feat: add KV-backed per-phone and per-IP rate limiter"
```

---

## Task 5: Turnstile siteverify client

Takes `fetch` as an injectable argument so the tests never touch the network.

**Files:**
- Create: `src/lib/server/turnstile.ts`, `tests/unit/turnstile.test.ts`

**Interfaces:**
- Consumes: `SecretRef` from `src/lib/cases.ts`.
- Produces:
  - `const SITEVERIFY_URL: string`
  - `const TEST_SECRETS: Record<'pass' | 'fail' | 'spent', string>`
  - `interface SiteverifyResponse { success: boolean; 'error-codes'?: string[]; action?: string; hostname?: string; challenge_ts?: string }`
  - `function resolveSecret(ref: SecretRef, envSecret: string | undefined): string`
  - `function siteverify(opts: { secret: string; token: string; remoteip?: string; fetchImpl?: typeof fetch }): Promise<SiteverifyResponse>`
  - `function checkClaims(response: SiteverifyResponse, expected: { action: string; hostname: string }): 'action-mismatch' | 'hostname-mismatch' | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/turnstile.test.ts
import { describe, expect, test } from 'bun:test';
import {
	checkClaims,
	resolveSecret,
	siteverify,
	SITEVERIFY_URL,
	TEST_SECRETS
} from '../../src/lib/server/turnstile';

/** Returns a fetch stub plus the bodies it was called with. */
function stubFetch(responses: (object | Error)[]) {
	const bodies: FormData[] = [];
	const urls: string[] = [];
	const impl = (async (url: string, init: RequestInit) => {
		urls.push(String(url));
		bodies.push(init.body as FormData);
		const next = responses[bodies.length - 1] ?? responses[responses.length - 1];
		if (next instanceof Error) throw next;
		return new Response(JSON.stringify(next), {
			headers: { 'content-type': 'application/json' }
		});
	}) as unknown as typeof fetch;
	return { impl, bodies, urls };
}

describe('resolveSecret', () => {
	test('maps the case refs to the documented dummy secrets', () => {
		expect(resolveSecret('pass', undefined)).toBe(TEST_SECRETS.pass);
		expect(resolveSecret('fail', undefined)).toBe(TEST_SECRETS.fail);
		expect(resolveSecret('spent', undefined)).toBe(TEST_SECRETS.spent);
	});

	test('ENV reads the environment secret', () => {
		expect(resolveSecret('ENV', 'real-secret')).toBe('real-secret');
	});

	test('ENV with no secret configured throws rather than silently passing', () => {
		expect(() => resolveSecret('ENV', undefined)).toThrow();
	});
});

describe('siteverify', () => {
	test('posts secret, response and remoteip to the Cloudflare endpoint', async () => {
		const { impl, bodies, urls } = stubFetch([{ success: true, action: 'request-otp' }]);
		const result = await siteverify({
			secret: TEST_SECRETS.pass,
			token: 'dummy-token',
			remoteip: '1.2.3.4',
			fetchImpl: impl
		});

		expect(result.success).toBe(true);
		expect(urls[0]).toBe(SITEVERIFY_URL);
		expect(bodies[0].get('secret')).toBe(TEST_SECRETS.pass);
		expect(bodies[0].get('response')).toBe('dummy-token');
		expect(bodies[0].get('remoteip')).toBe('1.2.3.4');
		expect(String(bodies[0].get('idempotency_key')).length).toBeGreaterThan(0);
	});

	test('propagates error-codes on failure', async () => {
		const { impl } = stubFetch([{ success: false, 'error-codes': ['invalid-input-response'] }]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });
		expect(result['error-codes']).toEqual(['invalid-input-response']);
	});

	test('retries once on internal-error, reusing the idempotency key', async () => {
		const { impl, bodies } = stubFetch([
			{ success: false, 'error-codes': ['internal-error'] },
			{ success: true }
		]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(result.success).toBe(true);
		expect(bodies.length).toBe(2);
		expect(bodies[0].get('idempotency_key')).toBe(bodies[1].get('idempotency_key'));
	});

	test('retries once on a network failure and reports network-error if both fail', async () => {
		const { impl, bodies } = stubFetch([new Error('boom'), new Error('boom')]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(bodies.length).toBe(2);
		expect(result.success).toBe(false);
		expect(result['error-codes']).toEqual(['network-error']);
	});

	test('does not retry a plain rejection', async () => {
		const { impl, bodies } = stubFetch([
			{ success: false, 'error-codes': ['timeout-or-duplicate'] },
			{ success: true }
		]);
		const result = await siteverify({ secret: 'x', token: 't', fetchImpl: impl });

		expect(bodies.length).toBe(1);
		expect(result['error-codes']).toEqual(['timeout-or-duplicate']);
	});
});

describe('checkClaims', () => {
	const expected = { action: 'request-otp', hostname: 'poc.example.com' };

	test('passes when action and hostname match', () => {
		expect(
			checkClaims({ success: true, action: 'request-otp', hostname: 'poc.example.com' }, expected)
		).toBeNull();
	});

	test('flags a mismatched action', () => {
		expect(
			checkClaims({ success: true, action: 'login', hostname: 'poc.example.com' }, expected)
		).toBe('action-mismatch');
	});

	test('flags a mismatched hostname', () => {
		expect(
			checkClaims({ success: true, action: 'request-otp', hostname: 'evil.example.com' }, expected)
		).toBe('hostname-mismatch');
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test tests/unit/turnstile.test.ts`
Expected: FAIL — `Cannot find module '../../src/lib/server/turnstile'`.

- [ ] **Step 3: Implement**

```ts
// src/lib/server/turnstile.ts
import type { SecretRef } from '$lib/cases';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare's documented dummy secrets. Public values, safe in source.
 * They only accept dummy tokens, and the real secret rejects dummy tokens,
 * so simulation cases cannot leak into each other.
 */
export const TEST_SECRETS = {
	pass: '1x0000000000000000000000000000000AA',
	fail: '2x0000000000000000000000000000000AA',
	spent: '3x0000000000000000000000000000000AA'
} as const;

export interface SiteverifyResponse {
	success: boolean;
	'error-codes'?: string[];
	action?: string;
	hostname?: string;
	challenge_ts?: string;
}

export function resolveSecret(ref: SecretRef, envSecret: string | undefined): string {
	if (ref !== 'ENV') return TEST_SECRETS[ref];
	if (!envSecret) throw new Error('TURNSTILE_SECRET_KEY is not set');
	return envSecret;
}

/**
 * Verifies a token. Retries exactly once, with the same idempotency key, when
 * Cloudflare reports `internal-error` or the request never completed — those are
 * the only two outcomes a retry can fix. A genuine rejection is returned as-is.
 */
export async function siteverify({
	secret,
	token,
	remoteip,
	fetchImpl = fetch
}: {
	secret: string;
	token: string;
	remoteip?: string;
	fetchImpl?: typeof fetch;
}): Promise<SiteverifyResponse> {
	const idempotencyKey = crypto.randomUUID();
	let last: SiteverifyResponse = { success: false, 'error-codes': ['network-error'] };

	for (let attempt = 0; attempt < 2; attempt++) {
		const body = new FormData();
		body.append('secret', secret);
		body.append('response', token);
		body.append('idempotency_key', idempotencyKey);
		if (remoteip) body.append('remoteip', remoteip);

		try {
			const response = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body });
			last = (await response.json()) as SiteverifyResponse;
			if (!last['error-codes']?.includes('internal-error')) return last;
		} catch {
			last = { success: false, 'error-codes': ['network-error'] };
		}
	}

	return last;
}

/**
 * Only meaningful for real keys: a dummy secret does not echo a trustworthy
 * action or hostname. Returns the error code to surface, or null when clean.
 */
export function checkClaims(
	response: SiteverifyResponse,
	expected: { action: string; hostname: string }
): 'action-mismatch' | 'hostname-mismatch' | null {
	if (response.action !== expected.action) return 'action-mismatch';
	if (response.hostname !== expected.hostname) return 'hostname-mismatch';
	return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test tests/unit/turnstile.test.ts`
Expected: PASS.

If the `$lib/cases` import fails under `bun test`, add the alias to `tsconfig.json`'s `compilerOptions.paths` (SvelteKit generates `.svelte-kit/tsconfig.json` with it, and `bun test` reads `tsconfig.json`):

```json
{
  "compilerOptions": {
    "paths": { "$lib": ["./src/lib"], "$lib/*": ["./src/lib/*"] }
  }
}
```

- [ ] **Step 5: Run the whole unit suite**

Run: `bun run test:unit`
Expected: PASS — cases, phone, ratelimit, turnstile.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/turnstile.ts tests/unit/turnstile.test.ts tsconfig.json
git commit -m "feat: add Turnstile siteverify client with idempotent retry"
```

---

## Task 6: The API — request pipeline and simulation reset

The route is deliberately thin: it sequences the modules from Tasks 2–5 and owns no logic of its own. Order matters and is fixed by the spec — siteverify runs **before** the rate limiter, so nobody can burn a victim's phone quota without solving a challenge.

The verification here is a checked-in smoke script rather than a unit test: the route's dependencies (`$env/dynamic/private`, `platform.env`) only exist inside a running SvelteKit server, and every branch that does *not* need a browser can be driven with `curl` in about a second. Task 9 covers the browser branches.

**Files:**
- Create: `src/routes/api/otp/request/+server.ts`, `src/routes/api/sim/reset/+server.ts`, `scripts/smoke.sh`
- Modify: `package.json` (add the `smoke` script)

**Interfaces:**
- Consumes: `findCase` (Task 2); `validatePhone`, `maskPhone` (Task 3); `hit`, `phoneKey`, `ipKey`, `resetCase`, `casePrefix` (Task 4); `siteverify`, `checkClaims`, `resolveSecret` (Task 5).
- Produces:
  - `POST /api/otp/request` — body `{ phone: string, token?: string, simCase: string }`
  - Success `200`: `{ ok: true, otpId: string, phone: string, expiresIn: 300, quota: { phone: { remaining, limit }, ip: { remaining, limit } } }`
  - Failure: `{ ok: false, error: string, detail?: string[] }` with status `400` / `403` / `422` / `429`; `429` also sets the `Retry-After` header
  - `POST /api/sim/reset` — body `{ simCase: string }` → `{ ok: true, deleted: number }`

- [ ] **Step 1: Write the request route**

```ts
// src/routes/api/otp/request/+server.ts
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findCase } from '$lib/cases';
import { maskPhone, validatePhone } from '$lib/server/phone';
import { hit, ipKey, phoneKey, type KVLike } from '$lib/server/ratelimit';
import { checkClaims, resolveSecret, siteverify } from '$lib/server/turnstile';
import type { RequestHandler } from './$types';

const TURNSTILE_ACTION = 'request-otp';

function fail(status: number, error: string, detail?: string[]) {
	return json({ ok: false, error, detail }, { status });
}

export const POST: RequestHandler = async ({ request, platform, getClientAddress, url }) => {
	// 1. Parse and resolve the case.
	let body: { phone?: unknown; token?: unknown; simCase?: unknown };
	try {
		body = await request.json();
	} catch {
		return fail(400, 'bad-request', ['body is not valid JSON']);
	}

	const simCase = typeof body.simCase === 'string' ? findCase(body.simCase) : undefined;
	if (!simCase) return fail(400, 'bad-request', ['unknown simCase']);

	// 2. Phone, before we spend a Cloudflare call on obvious garbage.
	const phone = typeof body.phone === 'string' ? body.phone : '';
	const validated = validatePhone(phone);
	if (!validated.ok) return fail(422, 'invalid-phone', ['expected an Indonesian mobile number']);

	// 3. Token must be present.
	const token = typeof body.token === 'string' ? body.token : '';
	if (!token) return fail(400, 'missing-token');

	// 4. Verify with Cloudflare.
	const ip = request.headers.get('CF-Connecting-IP') ?? getClientAddress();
	const secret = resolveSecret(simCase.secretRef, env.TURNSTILE_SECRET_KEY);
	const verification = await siteverify({ secret, token, remoteip: ip });

	if (!verification.success) {
		return fail(403, verification['error-codes']?.[0] ?? 'verification-failed', verification['error-codes']);
	}

	// Dummy secrets do not echo a trustworthy action or hostname, so only real keys are checked.
	if (simCase.secretRef === 'ENV') {
		const claim = checkClaims(verification, { action: TURNSTILE_ACTION, hostname: url.hostname });
		if (claim) return fail(403, claim, [`action=${verification.action}`, `hostname=${verification.hostname}`]);
	}

	// 5. Rate limit. Counted per verified attempt, per case, so demos stay independent.
	const kv = platform?.env?.RATE_LIMIT as unknown as KVLike | undefined;
	if (!kv) return fail(500, 'kv-unavailable', ['RATE_LIMIT binding is missing']);

	const window = Number(env.RATE_LIMIT_WINDOW ?? 600);
	const phoneLimit = Number(env.RATE_LIMIT_PER_PHONE ?? 3);
	const ipLimit = Number(env.RATE_LIMIT_PER_IP ?? 10);

	const phoneHit = await hit(kv, phoneKey(simCase.id, validated.e164), { window, limit: phoneLimit });
	const ipHit = await hit(kv, ipKey(simCase.id, ip), { window, limit: ipLimit });

	for (const [scope, result] of [
		['phone', phoneHit],
		['ip', ipHit]
	] as const) {
		if (!result.allowed) {
			return json(
				{ ok: false, error: 'rate-limited', scope, detail: [`${scope} limit reached`] },
				{ status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
			);
		}
	}

	// 6. Mock send.
	console.log(`[otp] case=${simCase.id} phone=${maskPhone(validated.e164)} ip=${ip}`);

	return json({
		ok: true,
		otpId: crypto.randomUUID(),
		phone: maskPhone(validated.e164),
		expiresIn: 300,
		quota: {
			phone: { remaining: phoneHit.remaining, limit: phoneLimit },
			ip: { remaining: ipHit.remaining, limit: ipLimit }
		}
	});
};
```

- [ ] **Step 2: Write the reset route**

```ts
// src/routes/api/sim/reset/+server.ts
import { json } from '@sveltejs/kit';
import { findCase } from '$lib/cases';
import { resetCase, type KVLike } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, platform }) => {
	const body = (await request.json().catch(() => ({}))) as { simCase?: unknown };
	// Resolving through findCase is what keeps this endpoint from deleting
	// anything outside the `rl:<known-case>:` prefix.
	const simCase = typeof body.simCase === 'string' ? findCase(body.simCase) : undefined;
	if (!simCase) return json({ ok: false, error: 'bad-request' }, { status: 400 });

	const kv = platform?.env?.RATE_LIMIT as unknown as KVLike | undefined;
	if (!kv) return json({ ok: false, error: 'kv-unavailable' }, { status: 500 });

	return json({ ok: true, deleted: await resetCase(kv, simCase.id) });
};
```

- [ ] **Step 3: Write the smoke script**

Covers every branch that does not need a browser. The `pass` test secret accepts any dummy token, so `"dummy"` is a valid token for those cases.

```bash
# scripts/smoke.sh
#!/usr/bin/env bash
# Exercises the non-browser branches of /api/otp/request.
# Usage: bun run smoke            (against http://localhost:5173)
#        BASE_URL=https://... bun run smoke
set -u
BASE="${BASE_URL:-http://localhost:5173}"
fails=0

post() { # $1=path $2=json  -> prints "<status> <body>"
  curl -s -o /tmp/smoke-body -w '%{http_code}' -X POST "$BASE$1" \
    -H 'content-type: application/json' -d "$2"
  printf ' '
  cat /tmp/smoke-body
}

check() { # $1=label $2=expected-status $3=expected-substring $4=path $5=json
  local out status
  out="$(post "$4" "$5")"
  status="${out%% *}"
  if [[ "$status" == "$2" && "$out" == *"$3"* ]]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1 -> $out (wanted $2 containing '$3')"
    fails=$((fails + 1))
  fi
}

echo "smoke against $BASE"
check 'unknown case'    400 'bad-request'               /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"nope"}'
check 'invalid phone'   422 'invalid-phone'             /api/otp/request '{"phone":"12","token":"dummy","simCase":"invalid-phone"}'
check 'missing token'   400 'missing-token'             /api/otp/request '{"phone":"081234567890","simCase":"missing-token"}'
check 'server rejects'  403 'invalid-input-response'    /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"server-rejects"}'
check 'token replay'    403 'timeout-or-duplicate'      /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"token-replay"}'

echo '  ... per-phone limit (4 requests, limit 3)'
curl -s -X POST "$BASE/api/sim/reset" -H 'content-type: application/json' -d '{"simCase":"per-phone"}' >/dev/null
for i in 1 2 3; do
  post /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}' >/dev/null
done
check 'per-phone 429'   429 'rate-limited'              /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}'
check 'reset clears'    200 '"ok":true'                 /api/sim/reset '{"simCase":"per-phone"}'
check 'after reset 200' 200 '"otpId"'                   /api/otp/request '{"phone":"081234567890","token":"dummy","simCase":"per-phone"}'

echo
if [[ $fails -eq 0 ]]; then echo "all smoke checks passed"; else echo "$fails smoke check(s) failed"; fi
exit $fails
```

`check` only does POSTs; `/api/health` is a GET and is already covered by Task 1 Step 8, so it is deliberately not in this script.

Make it executable and wire it up:

```bash
chmod +x scripts/smoke.sh
```

Add to `package.json` `"scripts"`: `"smoke": "bash scripts/smoke.sh"`.

- [ ] **Step 4: Run the smoke script against dev**

```bash
bun run dev &
sleep 6
bun run smoke
kill %1
```

Expected: `all smoke checks passed`.

Common failures and what they mean:
- `kv-unavailable` → Task 1 Step 8 regressed; the `platformProxy` binding is not reaching the request.
- `per-phone 429` returns 200 → `RATE_LIMIT_PER_PHONE` is not being read; check `.env` exists (copy from `.env.example`) and that the route reads `$env/dynamic/private`, not `$env/static/private`.
- `server rejects` returns 200 → `resolveSecret` is returning the passing secret; check the `secretRef` on the `server-rejects` case.

- [ ] **Step 5: Run the unit suite to confirm nothing regressed**

Run: `bun run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/api scripts/smoke.sh package.json
git commit -m "feat: add OTP request pipeline and simulation reset endpoints"
```

---

## Task 7: Sidebar shell and case navigation

UI, first half: the shell that lists cases and selects one. No Turnstile yet — this task is done when the sidebar navigates and the case card renders, which is independently reviewable.

The active case lives in the URL (`/?case=<id>`) so Playwright can deep-link and a demo can share a link to a specific case.

**Files:**
- Create: `src/lib/components/CaseCard.svelte`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`
- Modify: `src/app.css` (shadcn-svelte init writes the theme tokens), `components.json` (generated)
- Generated, do not hand-edit: `src/lib/components/ui/**`

**Interfaces:**
- Consumes: `cases`, `groupedCases`, `findCase`, `DEFAULT_PHONE`, `type SimCase` (Task 2).
- Produces:
  - `/?case=<id>` selects a case; no `case` param falls back to the first case in the table
  - `CaseCard.svelte` props: `{ simCase: SimCase }`
  - Every sidebar item carries `data-case="<id>"`; the case card carries `data-testid="case-card"` — these are the Playwright selectors Task 9 depends on, so do not rename them

- [ ] **Step 0: Search the 21st.dev catalog for layout and result-panel inspiration**

`CLAUDE.md` requires searching 21st before hand-writing UI. Use `mcp__plugin_21st_21st__search` (the `@21st-dev/magic` server is down and its API key is stale — do not use it). Catalog items are React: take layout and spacing ideas only, port anything you use to Svelte by hand, and keep shadcn-svelte tokens. If nothing fits, say so and move on — this step is a look, not a dependency.

- [ ] **Step 1: Initialise shadcn-svelte and pull the components**

```bash
bunx shadcn-svelte@latest init
bunx shadcn-svelte@latest add sidebar card input button badge
```

`init` prompts for a base colour and paths; accept the defaults it offers for a SvelteKit + Tailwind project (`$lib/components`, `src/app.css`). If it asks about a theme, pick a neutral one — the spec only requires that dark and light both work through the tokens.

- [ ] **Step 2: Confirm the generated components landed**

```bash
ls src/lib/components/ui
```

Expected: `badge  button  card  input  sidebar`.

- [ ] **Step 3: Write the case card**

```svelte
<!-- src/lib/components/CaseCard.svelte -->
<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { SimCase } from '$lib/cases';

	let { simCase }: { simCase: SimCase } = $props();

	const expectation = $derived(
		simCase.expected.widgetError
			? 'widget blocks the request'
			: `HTTP ${simCase.expected.status}${simCase.expected.errorCode ? ` · ${simCase.expected.errorCode}` : ''}`
	);
</script>

<Card.Root data-testid="case-card">
	<Card.Header>
		<Card.Title>{simCase.title}</Card.Title>
		<Card.Description>{simCase.description}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-2">
		<Badge variant="secondary">Expected</Badge>
		<span data-testid="case-expectation" class="text-sm font-mono">{expectation}</span>
		{#if simCase.manual}
			<Badge variant="outline">manual</Badge>
		{/if}
		{#if simCase.repeat}
			<Badge variant="outline">×{simCase.repeat}</Badge>
		{/if}
	</Card.Content>
</Card.Root>
```

- [ ] **Step 4: Write the layout with the sidebar**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	import '../app.css';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { page } from '$app/state';
	import { cases, groupedCases } from '$lib/cases';

	let { children } = $props();

	const activeId = $derived(page.url.searchParams.get('case') ?? cases[0].id);
	const groups = groupedCases();
</script>

<Sidebar.Provider>
	<Sidebar.Root>
		<Sidebar.Header class="px-4 py-3">
			<h1 class="text-sm font-semibold">Turnstile OTP simulations</h1>
			<p class="text-xs text-muted-foreground">Cloudflare Turnstile · phone validation · rate limits</p>
		</Sidebar.Header>
		<Sidebar.Content>
			{#each groups as group (group.group)}
				<Sidebar.Group>
					<Sidebar.GroupLabel>{group.group}</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={item.id === activeId}>
										{#snippet child({ props })}
											<a href="/?case={item.id}" data-case={item.id} {...props}>
												<span>{item.title}</span>
												{#if item.manual}
													<Badge variant="outline" class="ml-auto">manual</Badge>
												{/if}
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>
	</Sidebar.Root>

	<main class="flex-1 p-6">
		<Sidebar.Trigger class="mb-4 md:hidden" />
		{@render children?.()}
	</main>
</Sidebar.Provider>
```

If `Sidebar.MenuButton`'s `child` snippet signature differs in shadcn-svelte 1.7, fetch the current sidebar docs from Context7 (`/websites/shadcn-svelte`, query "Sidebar.MenuButton child snippet link") and follow what it shows. The non-negotiable part is the `data-case` attribute on the clickable element.

- [ ] **Step 5: Write the page (form comes in Task 8)**

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
	import CaseCard from '$lib/components/CaseCard.svelte';
	import { page } from '$app/state';
	import { cases, findCase } from '$lib/cases';

	const simCase = $derived(findCase(page.url.searchParams.get('case') ?? '') ?? cases[0]);
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
	<CaseCard {simCase} />
</div>
```

- [ ] **Step 6: Run the Svelte autofixer on every file you just wrote**

Run `mcp__plugin_svelte_svelte__svelte-autofixer` on `src/lib/components/CaseCard.svelte`, `src/routes/+layout.svelte` and `src/routes/+page.svelte`. Apply what it reports and re-run until it returns clean.

- [ ] **Step 7: Check types and look at it**

```bash
bun run check
bun run dev
```

Expected: `bun run check` reports 0 errors. In the browser:
- eleven cases in four groups; clicking one updates the URL and swaps the card
- `interactive` and `real-keys` carry a `manual` badge
- at phone width (DevTools, 390px) the sidebar collapses to a sheet and nothing scrolls horizontally
- toggling the OS/browser colour scheme to dark and back keeps every surface and label readable — the shadcn tokens should handle this with no extra CSS. If a panel stays light in dark mode, it is a hardcoded colour; replace it with a token (`bg-background`, `text-muted-foreground`, `bg-muted`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add sidebar shell and case card"
```

---

## Task 8: Turnstile widget, form and result panel

UI, second half. The `repeat` loop lives in the form, not in the test: one click fires all N requests and the panel shows the last one. That keeps the E2E suite to "click once, assert once" for every case.

**Files:**
- Create: `src/lib/components/Turnstile.svelte`, `src/lib/components/OtpForm.svelte`, `src/lib/components/ResultPanel.svelte`
- Modify: `src/routes/+page.svelte`, `src/app.d.ts`

**Interfaces:**
- Consumes: `SimCase`, `DEFAULT_PHONE` (Task 2); `POST /api/otp/request`, `POST /api/sim/reset` (Task 6); `CaseCard` (Task 7).
- Produces:
  - `Turnstile.svelte` props: `{ sitekey: string, token: string (bindable), onerror?: (code: string) => void }`, instance method `reset(): void`
  - `OtpForm.svelte` props: `{ simCase: SimCase, sitekey: string, onresult: (r: RunResult) => void }`
  - `ResultPanel.svelte` props: `{ simCase: SimCase, result: RunResult | null }`
  - `interface RunResult { status: number | null; body: unknown; elapsedMs: number; attempts: number; widgetError?: string }` — exported from `src/lib/components/ResultPanel.svelte`'s `<script module>`
  - Playwright selectors (do not rename): `phone-input`, `submit`, `result-panel`, `result-status`, `result-error`, `widget-error`

- [ ] **Step 1: Type the Turnstile global**

Append to `src/app.d.ts`, inside the existing `declare global` block:

```ts
	interface TurnstileRenderOptions {
		sitekey: string;
		action?: string;
		callback?: (token: string) => void;
		'error-callback'?: (code: string) => void;
	}

	interface Window {
		turnstile?: {
			render(el: HTMLElement, options: TurnstileRenderOptions): string;
			remove(widgetId: string): void;
			reset(widgetId: string): void;
		};
	}
```

- [ ] **Step 2: Write the widget wrapper**

`api.js` is loaded once per page with `render=explicit`, so switching cases re-renders the widget with a new sitekey instead of reloading the script.

```svelte
<!-- src/lib/components/Turnstile.svelte -->
<script lang="ts">
	interface Props {
		sitekey: string;
		token?: string;
		onerror?: (code: string) => void;
	}

	let { sitekey, token = $bindable(''), onerror }: Props = $props();

	let container: HTMLDivElement;
	let widgetId: string | undefined;

	/** Module-level so the script is fetched once even if the component remounts. */
	let scriptPromise: Promise<void> | undefined;

	function loadScript() {
		if (scriptPromise) return scriptPromise;
		scriptPromise = new Promise((resolve, reject) => {
			const el = document.createElement('script');
			el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
			el.async = true;
			el.onload = () => resolve();
			el.onerror = () => reject(new Error('turnstile-script-failed'));
			document.head.appendChild(el);
		});
		return scriptPromise;
	}

	/** Re-renders whenever the case (and therefore the sitekey) changes. */
	$effect(() => {
		const key = sitekey;
		let cancelled = false;

		loadScript()
			.then(() => {
				if (cancelled || !window.turnstile) return;
				token = '';
				widgetId = window.turnstile.render(container, {
					sitekey: key,
					action: 'request-otp',
					callback: (t) => {
						token = t;
					},
					'error-callback': (code) => {
						token = '';
						onerror?.(String(code ?? 'widget-error'));
					}
				});
			})
			.catch((err: Error) => onerror?.(err.message));

		return () => {
			cancelled = true;
			if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
			widgetId = undefined;
		};
	});

	/** Clears the solved token so the next submit gets a fresh one. */
	export function reset() {
		if (widgetId && window.turnstile) {
			token = '';
			window.turnstile.reset(widgetId);
		}
	}
</script>

<div bind:this={container} data-testid="turnstile-widget"></div>
```

- [ ] **Step 3: Write the result panel**

```svelte
<!-- src/lib/components/ResultPanel.svelte -->
<script module lang="ts">
	export interface RunResult {
		/** null when the widget blocked and no request was sent. */
		status: number | null;
		body: unknown;
		elapsedMs: number;
		attempts: number;
		widgetError?: string;
	}
</script>

<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { SimCase } from '$lib/cases';

	let { simCase, result }: { simCase: SimCase; result: RunResult | null } = $props();

	const body = $derived(result?.body as Record<string, unknown> | undefined);
	const errorCodes = $derived((body?.detail as string[] | undefined) ?? []);
	const quota = $derived(
		body?.quota as { phone: { remaining: number; limit: number }; ip: { remaining: number; limit: number } } | undefined
	);

	let resetting = $state(false);
	let resetMessage = $state('');

	async function resetQuota() {
		resetting = true;
		const response = await fetch('/api/sim/reset', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ simCase: simCase.id })
		});
		const json = (await response.json()) as { deleted?: number };
		resetMessage = `cleared ${json.deleted ?? 0} key(s)`;
		resetting = false;
	}
</script>

<Card.Root data-testid="result-panel">
	<Card.Header>
		<Card.Title>Result</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if !result}
			<p class="text-sm text-muted-foreground">Submit the form to run this case.</p>
		{:else if result.widgetError}
			<div class="flex items-center gap-2">
				<Badge variant="destructive">widget blocked</Badge>
				<span data-testid="widget-error" class="font-mono text-sm">{result.widgetError}</span>
			</div>
			<p class="text-sm text-muted-foreground">No request was sent to the server.</p>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={result.status === 200 ? 'default' : 'destructive'} data-testid="result-status">
					{result.status}
				</Badge>
				<span data-testid="result-error" class="font-mono text-sm">
					{(body?.error as string) ?? 'ok'}
				</span>
				<span class="text-xs text-muted-foreground">
					{result.attempts} request(s) · {result.elapsedMs} ms
				</span>
			</div>

			{#if errorCodes.length}
				<p class="font-mono text-xs text-muted-foreground">
					error-codes: {errorCodes.join(', ')}
				</p>
			{/if}

			<pre class="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(result.body, null, 2)}</pre>
		{/if}

		{#if simCase.group === 'Rate limit'}
			<div class="flex items-center gap-3 border-t pt-3">
				{#if quota}
					<span class="text-xs text-muted-foreground">
						remaining — phone {quota.phone.remaining}/{quota.phone.limit}, ip {quota.ip.remaining}/{quota.ip.limit}
					</span>
				{/if}
				<Button size="sm" variant="outline" disabled={resetting} onclick={resetQuota}>
					Reset this case's quota
				</Button>
				{#if resetMessage}<span class="text-xs text-muted-foreground">{resetMessage}</span>{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
```

- [ ] **Step 4: Write the form**

```svelte
<!-- src/lib/components/OtpForm.svelte -->
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Turnstile from './Turnstile.svelte';
	import type { RunResult } from './ResultPanel.svelte';
	import { DEFAULT_PHONE, type SimCase } from '$lib/cases';

	interface Props {
		simCase: SimCase;
		sitekey: string;
		onresult: (result: RunResult) => void;
	}

	let { simCase, sitekey, onresult }: Props = $props();

	let phone = $state(simCase.phone ?? DEFAULT_PHONE);
	let token = $state('');
	let widget: Turnstile;
	let running = $state(false);
	/** Set when the widget's error-callback fires; there will never be a token. */
	let widgetFailed = $state(false);

	// Switching cases re-prefills the field and drops any stale result.
	$effect(() => {
		phone = simCase.phone ?? DEFAULT_PHONE;
	});

	/** per-ip needs a different number each round so the per-phone limit does not trip first. */
	function phoneFor(attempt: number) {
		return simCase.varyPhone ? `081234567${String(attempt).padStart(3, '0')}` : phone;
	}

	function waitForToken(timeoutMs = 15000) {
		return new Promise<string>((resolve, reject) => {
			const started = Date.now();
			const poll = setInterval(() => {
				if (token) {
					clearInterval(poll);
					resolve(token);
				} else if (Date.now() - started > timeoutMs) {
					clearInterval(poll);
					reject(new Error('token-timeout'));
				}
			}, 100);
		});
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		// The widget already refused; do not sit waiting for a token that is not coming.
		if (simCase.sendToken && widgetFailed) return;
		running = true;

		const attempts = simCase.repeat ?? 1;
		const started = performance.now();
		let last: Response | undefined;
		let body: unknown;

		try {
			for (let i = 0; i < attempts; i++) {
				let currentToken = '';
				if (simCase.sendToken) {
					currentToken = token || (await waitForToken());
				}

				last = await fetch('/api/otp/request', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						phone: phoneFor(i),
						token: simCase.sendToken ? currentToken : undefined,
						simCase: simCase.id
					})
				});
				body = await last.json();

				// A token is single-use in production, so take a fresh one for the next round.
				if (i < attempts - 1 && simCase.sendToken) widget.reset();
			}

			onresult({
				status: last?.status ?? null,
				body,
				elapsedMs: Math.round(performance.now() - started),
				attempts
			});
		} catch (err) {
			onresult({
				status: null,
				body: { ok: false, error: (err as Error).message },
				elapsedMs: Math.round(performance.now() - started),
				attempts,
				widgetError: (err as Error).message
			});
		} finally {
			running = false;
		}
	}
</script>

<form class="flex flex-col gap-4" onsubmit={submit}>
	<Input
		data-testid="phone-input"
		bind:value={phone}
		name="phone"
		placeholder="08xx xxxx xxxx"
		autocomplete="tel"
		aria-label="Phone number"
	/>

	<Turnstile
		bind:this={widget}
		bind:token
		{sitekey}
		onerror={(code) => {
			widgetFailed = true;
			onresult({ status: null, body: null, elapsedMs: 0, attempts: 0, widgetError: code });
		}}
	/>

	<Button type="submit" data-testid="submit" disabled={running}>
		{running ? 'Running…' : `Request OTP${simCase.repeat ? ` ×${simCase.repeat}` : ''}`}
	</Button>
</form>
```

- [ ] **Step 5: Wire the page**

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
	import CaseCard from '$lib/components/CaseCard.svelte';
	import OtpForm from '$lib/components/OtpForm.svelte';
	import ResultPanel, { type RunResult } from '$lib/components/ResultPanel.svelte';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { cases, findCase } from '$lib/cases';

	const simCase = $derived(findCase(page.url.searchParams.get('case') ?? '') ?? cases[0]);
	const sitekey = $derived(
		simCase.sitekey === 'ENV' ? (env.PUBLIC_TURNSTILE_SITEKEY ?? '') : simCase.sitekey
	);

	let result = $state<RunResult | null>(null);

	// A result belongs to the case that produced it.
	$effect(() => {
		simCase.id;
		result = null;
	});
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
	<CaseCard {simCase} />
	{#key simCase.id}
		<OtpForm {simCase} {sitekey} onresult={(r) => (result = r)} />
	{/key}
	<ResultPanel {simCase} {result} />
</div>
```

- [ ] **Step 6: Run the Svelte autofixer on every `.svelte` file you touched**

Run `mcp__plugin_svelte_svelte__svelte-autofixer` on `Turnstile.svelte`, `OtpForm.svelte`, `ResultPanel.svelte` and `src/routes/+page.svelte`. Apply what it reports and re-run until clean.

- [ ] **Step 7: Check types, then drive it by hand**

```bash
bun run check
bun run dev
```

Expected, clicking through in the browser:
- `pass-visible` → 200 with an `otpId` and a masked phone
- `widget-blocks` → red "widget blocked" badge, nothing in the network tab for `/api/otp/request`
- `missing-token` → 400 `missing-token`
- `per-phone` → one click fires 4 requests and lands on 429; the reset button clears it

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Turnstile widget, OTP form and result panel"
```

---

## Task 9: Playwright suite generated from the case table

One test per non-`manual` case, generated by iterating `cases`. Adding a case to the table adds a test automatically; that is the mechanism the spec relies on to guarantee "every case in the sidebar has a matching test".

**Files:**
- Create: `tests/e2e/cases.spec.ts`
- Modify: `playwright.config.ts` (written by the `sv` add-on in Task 1)
- Delete: the `e2e/` directory and the demo spec the add-on generated

**Interfaces:**
- Consumes: `cases`, `DEFAULT_PHONE` (Task 2); the selectors from Tasks 7–8 (`[data-case]`, `phone-input`, `submit`, `result-status`, `result-error`, `widget-error`).
- Produces: `bun run test:e2e` — green for all nine automatable cases.

- [ ] **Step 1: Point Playwright at `tests/e2e` and at the dev server**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	// One worker: every case shares the same origin and IP, so parallel runs
	// would contend on the per-IP rate-limit counters.
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry'
	},
	webServer: {
		command: 'bun run dev',
		port: 5173,
		reuseExistingServer: !process.env.CI,
		timeout: 60_000
	}
});
```

```bash
rm -rf e2e
```

- [ ] **Step 2: Write the suite**

```ts
// tests/e2e/cases.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { cases, DEFAULT_PHONE } from '../../src/lib/cases';

/** Clears this case's rate-limit counters so repeated local runs start clean. */
async function resetCase(page: Page, id: string) {
	const response = await page.request.post('/api/sim/reset', { data: { simCase: id } });
	expect(response.status()).toBe(200);
}

for (const simCase of cases.filter((c) => !c.manual)) {
	// The repeat cases make one round trip per attempt, each waiting on a fresh
	// widget token, so they need materially more than the default budget.
	const timeout = (simCase.repeat ?? 1) > 1 ? 120_000 : 30_000;

	test(simCase.id, async ({ page }) => {
		test.setTimeout(timeout);

		const otpRequests: string[] = [];
		page.on('request', (r) => {
			if (r.url().includes('/api/otp/request')) otpRequests.push(r.url());
		});

		await resetCase(page, simCase.id);
		await page.goto(`/?case=${simCase.id}`);

		// The sidebar is the documented way in, so click it rather than trusting the deep link alone.
		await page.locator(`[data-case="${simCase.id}"]`).click();
		await expect(page.getByTestId('case-card')).toBeVisible();

		const phoneInput = page.getByTestId('phone-input');
		await expect(phoneInput).toHaveValue(simCase.phone ?? DEFAULT_PHONE);

		await page.getByTestId('submit').click();

		if (simCase.expected.widgetError) {
			await expect(page.getByTestId('widget-error')).toBeVisible({ timeout: 20_000 });
			expect(otpRequests).toHaveLength(0);
			return;
		}

		await expect(page.getByTestId('result-status')).toHaveText(String(simCase.expected.status), {
			timeout
		});
		await expect(page.getByTestId('result-error')).toHaveText(simCase.expected.errorCode ?? 'ok');
	});
}
```

- [ ] **Step 3: Install browsers and run it**

```bash
bunx playwright install chromium
bun run test:e2e
```

Expected: 9 passed (`pass-visible`, `pass-invisible`, `widget-blocks`, `server-rejects`, `token-replay`, `missing-token`, `invalid-phone`, `per-phone`, `per-ip`).

Triage for the likely failures:
- **`missing-token` times out waiting for a status** — the form is still waiting on a token. Confirm `simCase.sendToken === false` short-circuits `waitForToken` in `OtpForm.svelte`.
- **`widget-blocks` sees a request** — the error-callback is firing but submit still runs. The `onerror` handler must set a result without going through `submit`.
- **`per-ip` fails at 200 instead of 429** — `varyPhone` is not being applied, so the per-*phone* limit tripped at request 4 and returned 429 early (which would fail on the error code, not the status) or the phones are colliding. Log `phoneFor(i)` and check the generated numbers are distinct and valid.
- **`per-phone` flakes between 429 and 200** — the reset in `resetCase` raced the run. KV is eventually consistent; add `await page.waitForTimeout(250)` after the reset.
- **A repeat case times out** — the widget is not re-solving after `reset()`. Confirm `Turnstile.reset()` clears `token` *and* calls `window.turnstile.reset(widgetId)`.

- [ ] **Step 4: Confirm the guarantee actually holds**

Every non-manual case now has a test because the suite is generated from the table. Verify the count matches:

```bash
bun run test:e2e --list | grep -c "cases.spec.ts"
```

Expected: 9 — equal to `cases.filter(c => !c.manual).length`.

- [ ] **Step 5: Run everything**

```bash
bun run test:unit && bun run test:e2e
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add Playwright suite generated from the case table"
```

---

## Task 10: Deploy to Cloudflare Pages and document it

Real Cloudflare resources get created here. Everything before this ran locally.

**Files:**
- Modify: `wrangler.toml` (real KV namespace id), `README.md`
- Create: `README.md` if `sv create` did not write one

**Interfaces:**
- Consumes: everything.
- Produces: a live Pages URL where all eleven cases behave as the table says.

- [ ] **Step 1: Load the wrangler skill**

Run the `wrangler` skill before any wrangler command — there is no Cloudflare MCP in this environment, so the CLI is the only path and the syntax must be right the first time.

- [ ] **Step 2: Authenticate**

```bash
bunx wrangler whoami
```

If this is not logged in, ask the human to run `! bunx wrangler login` in their session — it opens a browser and cannot be completed from here. Do not proceed until `whoami` names an account.

- [ ] **Step 3: Create the KV namespace and the Pages project**

```bash
bunx wrangler kv namespace create RATE_LIMIT
bunx wrangler pages project create poc-cloudflare-turnstile --production-branch main
```

- [ ] **Step 4: Put the real namespace id in `wrangler.toml`**

Replace `PLACEHOLDER_REPLACED_IN_TASK_10` with the `id` the previous command printed. Add the preview environment so preview deployments get their own store:

```toml
"$schema" = "./node_modules/wrangler/config-schema.json"
name = "poc-cloudflare-turnstile"
pages_build_output_dir = ".svelte-kit/cloudflare"
compatibility_date = "2026-09-22"
compatibility_flags = ["nodejs_als"]

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "<the id wrangler printed>"

[vars]
RATE_LIMIT_WINDOW = "600"
RATE_LIMIT_PER_PHONE = "3"
RATE_LIMIT_PER_IP = "10"
PUBLIC_TURNSTILE_SITEKEY = "1x00000000000000000000AA"

[env.preview]
[[env.preview.kv_namespaces]]
binding = "RATE_LIMIT"
id = "<the id wrangler printed>"

[env.preview.vars]
RATE_LIMIT_WINDOW = "600"
RATE_LIMIT_PER_PHONE = "3"
RATE_LIMIT_PER_IP = "10"
PUBLIC_TURNSTILE_SITEKEY = "1x00000000000000000000AA"
```

Note: once `pages_build_output_dir` is present, this file is the **source of truth** — these values can no longer be edited in the Cloudflare dashboard.

`PUBLIC_TURNSTILE_SITEKEY` stays the test key until the human supplies a real one; the `real-keys` case is `manual` precisely because it needs that.

- [ ] **Step 5: Re-verify local dev still works with the real config**

```bash
bun run dev &
sleep 6
curl -s http://localhost:5173/api/health
bun run smoke
kill %1
```

Expected: `{"ok":true,"kv":true}` and `all smoke checks passed`. A `[vars]` block that shadows `.env` is the usual cause if limits suddenly behave differently.

- [ ] **Step 6: Set the secret and deploy**

```bash
bunx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name poc-cloudflare-turnstile
bun run build
bunx wrangler pages deploy
```

`bunx wrangler pages deploy` needs no directory argument because `pages_build_output_dir` is set.

If the human has no real Turnstile secret yet, set the passing test secret `1x0000000000000000000000000000000AA` so every non-`real-keys` case works on the deployed site, and note in the README that `real-keys` stays red until real keys are configured.

**For the `real-keys` case to pass, the Turnstile widget in the Cloudflare dashboard must list the deployed Pages hostname under its allowed domains, and its action must be left unrestricted or set to `request-otp`.** Test sitekeys work on any domain, so this only bites the one production case. Ask the human to add the hostname if you cannot reach the dashboard — it is a dashboard-only setting with no wrangler equivalent.

- [ ] **Step 7: Verify the deployment**

```bash
BASE_URL=https://<the deployed url> bun run smoke
```

Expected: `all smoke checks passed`. Then open the URL and click through the sidebar: `pass-visible` → 200, `widget-blocks` → widget blocked, `per-phone` → 429 on the fourth request.

Also check `https://<url>/api/health` returns `{"ok":true,"kv":true}` — that is the production KV binding confirming itself.

- [ ] **Step 8: Write the README**

````markdown
# PoC — Cloudflare Turnstile on an OTP request form

A single-field "request OTP" form behind Cloudflare Turnstile, with Indonesian
phone validation and KV-backed rate limiting. The sidebar lists every simulation
case and runs it live against the real Cloudflare siteverify API using
Cloudflare's documented test keys.

Deployed: <the Pages URL>

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

`BASE_URL=https://<url> bun run smoke` runs the same checks against a deployment.

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

## Known limits

- The rate limiter uses KV `get` + `put`, which is not atomic and is eventually
  consistent — a concurrent burst can let one extra request through. Fine for a
  PoC; a Durable Object per key is the upgrade path.
- OTP delivery is mocked (`console.log`); there is no verification step.
- Token expiry (300 s) is not simulated live — it surfaces as
  `timeout-or-duplicate`, which the `token-replay` case already covers.
````

- [ ] **Step 9: Final full check**

```bash
bun run check && bun run test:unit && bun run test:e2e
```

Expected: all green.

- [ ] **Step 10: Commit and push**

```bash
git add -A
git commit -m "feat: deploy to Cloudflare Pages and document the PoC"
git push origin main
```

---

## Acceptance — the plan is done when all of these hold

- [ ] `bun run dev` serves the app and `/api/health` reports `kv: true`
- [ ] `bun run test:unit` is green (cases, phone, ratelimit, turnstile)
- [ ] `bun run test:e2e` is green for all 9 non-manual cases
- [ ] `bun run smoke` is green against both localhost and the deployed URL
- [ ] All 11 cases appear in the sidebar, grouped, with `manual` badges on `interactive` and `real-keys`
- [ ] `per-phone` and `per-ip` each return 429 with a `Retry-After` header, and the reset button clears the case's quota
- [ ] `widget-blocks` sends no request to `/api/otp/request`
- [ ] `invalid-phone` returns 422 without calling siteverify
- [ ] `.env` is not in the repo; `.env.example` is
- [ ] The deployed Pages URL behaves the same as local for every non-manual case
- [ ] `interactive` and `real-keys` verified by hand, or explicitly reported as blocked on real keys

---

## Notes for the executor

- **Do not re-open stack decisions.** SvelteKit + shadcn-svelte, Bun, Cloudflare Pages, KV, Playwright, mock OTP, Indonesia-only phones are final.
- **If a step's API has moved** (shadcn-svelte's sidebar snippet API is the most likely), query Context7 for the current shape and follow it. That is a version fix, not a design change — just do it and note it in the commit.
- **If something in the spec turns out to be wrong** (not stale, wrong), stop and send the question to `thinker`. Do not redesign in place.
- **Task 1 Step 8 is a gate.** If `kv` is not `true` in dev, nothing downstream can be verified; fix it there rather than working around it later.
