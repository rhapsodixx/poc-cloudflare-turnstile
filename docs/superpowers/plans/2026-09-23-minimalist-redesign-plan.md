# Minimalist Redesign + GSAP Motion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session rule (project-specific):** executed by the `executor` session only. See `CLAUDE.md`. Design questions go to `thinker`; do not redesign in place.

**Goal:** Re-skin the existing OTP-simulation UI into quiet editorial minimalism and add four GSAP micro-animations, changing no behaviour, no route, no prop shape and no test hook — the existing `bun test` and `tests/e2e/cases.spec.ts` must pass completely unmodified.

**Architecture:** Presentation-layer only. One new module, `src/lib/motion.ts`, owns every tween, every duration and the `prefers-reduced-motion` gate; components call its named functions from `$effect` blocks keyed on existing reactive state and invoke the returned kill handle in the effect cleanup. Restyling happens through Tailwind classes at the call sites — the shadcn-svelte primitives under `src/lib/components/ui/**` are never edited, so they stay upgradeable.

**Tech Stack:** Existing SvelteKit 2 / Svelte 5.56 / Tailwind v4 / shadcn-svelte 1.7 stack, plus `gsap` 3.15 core (no plugins).

**Spec:** `docs/superpowers/specs/2026-09-23-minimalist-redesign-design.md` — read it alongside this plan. It builds on `docs/superpowers/specs/2026-09-22-turnstile-otp-poc-design.md`.

---

## Global Constraints

### The three invariants that protect the test suite

The spec's central claim is "the full existing Playwright suite passes unmodified". That holds only if these three rules are obeyed in every task. They are derived from Playwright's own actionability rules (`docs/src/actionability.md`), quoted verbatim:

1. **Opacity is free.** *"Elements with `opacity:0` are considered visible."* So fading `opacity` on a node never affects `toBeVisible()`. Fade whatever you like.

2. **Transform is not free on a click target.** *"Element is considered stable when it has maintained the same bounding box for at least two consecutive animation frames."* A `.click()` waits for stability. The suite clicks exactly two things: `[data-case="<id>"]` (sidebar item) and `[data-testid="submit"]`. **Never animate `x`/`y`/`scale`/`rotation` on those two elements, or on any ancestor whose box moves them.** The submit button's pulse animates `opacity` only, for exactly this reason — and that is also why the sidebar's active state is pure CSS with no GSAP at all.

3. **Never gate presence or text on an animation.** Every `data-testid` node must enter the DOM, with its final text and `disabled` state, on the same tick it does today. GSAP only ever animates `opacity` and `transform` on nodes that are already mounted and already correct. `running` flipping and the label swapping to `Running…` stay synchronous.

### Scope

- **Presentation only.** Do not touch `src/lib/cases.ts`, anything under `src/lib/server/`, `src/routes/api/**`, `playwright.config.ts`, or any file in `tests/`.
- **Do not edit `src/lib/components/ui/**`.** All restyling is Tailwind classes passed at the call site. `cn()` (tailwind-merge) lets a call-site class beat a primitive's base class for the same property.
- **Do not add a GSAP plugin.** Core `gsap.to` / `gsap.fromTo` / `gsap.timeline` covers all four moments. No ScrollTrigger, Flip, SplitText.
- **Do not restructure the layout.** Sidebar + single-column main panel, `CaseCard` → `OtpForm` → `ResultPanel`, stays as-is. This was considered and declined in the spec.
- **Do not change any `data-testid`, route, or prop shape** on `CaseCard` / `OtpForm` / `ResultPanel` / `Turnstile`. New hooks for GSAP use `data-motion="..."`, never `data-testid`.
- **No new dependency except `gsap`.**

### Motion contract

- Durations: `fast` = 0.2s (input feedback), `base` = 0.4s (reveals).
- Ease: `power2.out` for every directional tween. The one looping tween (the button pulse) uses `sine.inOut` — a yoyo loop on an `-out` ease pulses visibly unevenly. This is the plan's one named deviation from the spec's "one shared ease"; both are exported as named constants from `motion.ts` so it stays a single decision in a single place.
- `prefersReducedMotion()` gates **every** exported function: when true it applies the end state with `gsap.set` and returns immediately.
- Cleanup always uses `clearProps`, never a hardcoded value — a hardcoded `opacity: 1` would defeat the primitives' own `disabled:opacity-50`.

Two further departures from the function sketch in spec §3, both deliberate:

- **`crossfadeSkeleton(el)` takes one element, not `(from, to)`.** There is nothing to fade *in* — the Turnstile iframe simply appears in the slot it was already occupying. A second argument would only ever be passed `null`.
- **A fifth function, `settleValid(el)`, exists.** Spec §4 asks for a settle on valid submit as well as a shake on invalid; giving it its own name keeps the reduced-motion gate in one place per moment rather than branching inside `shakeInvalid`.

### Colour and CSS-transition gotchas

- **GSAP cannot interpolate `oklch()`**, and this project's whole token scale is oklch. So **GSAP never tweens a colour in this plan.** Colour changes are driven by Svelte toggling a Tailwind class, and the primitives' existing `transition-colors` eases them. GSAP owns `opacity` and `transform` only.
- **`transition-all` on the button fights GSAP.** `src/lib/components/ui/button/button.svelte` has `transition-all` in its base. Left alone it re-eases every GSAP frame and the pulse smears. The submit button therefore gets `transition-none` at the call site.

### Conventions

- Commit messages: Conventional Commits. Commit at the end of every task.
- **Run the Svelte MCP autofixer (`mcp__plugin_svelte_svelte__svelte-autofixer`) on every changed `.svelte` file**, re-running until clean.
- **Load the `gsap-frameworks` skill before writing any GSAP code** (it covers the Svelte lifecycle/cleanup shape), and `gsap-core` for the tween API. Prefer the `svelte:svelte-file-editor` agent for `.svelte` edits.
- Context7 MCP before memory for GSAP, Tailwind v4 and shadcn-svelte APIs.

### Verification commands

```bash
bun run check        # svelte-check, must stay at 0 errors
bun run test:unit    # must stay green; this plan touches nothing it covers
bun run test:e2e     # the full suite, ~3 min (the two repeat cases dominate)
```

Intermediate tasks use the fast subset, which skips the two slow rate-limit cases:

```bash
bunx playwright test -g "pass-visible|pass-invisible|widget-blocks|missing-token|invalid-phone|server-rejects|token-replay"
```

Task 7 runs the full suite.

---

## File Structure

| File | Change | Task |
|---|---|---|
| `package.json` | add `gsap` to `dependencies` | 1 |
| `src/lib/motion.ts` | **new** — durations, ease, reduced-motion gate, four moment functions | 1 |
| `src/app.css` | add `--accent-brand` / `--accent-brand-foreground` to `:root`, `.dark` and `@theme inline` | 2 |
| `src/routes/+layout.svelte` | de-chrome the sidebar; left accent bar active state; main-panel rhythm | 2 |
| `src/lib/components/CaseCard.svelte` | de-box: drop `Card.*`, hairline divider, weight-based hierarchy | 3 |
| `src/routes/+page.svelte` | vertical rhythm + dividers between the three sections | 3 |
| `src/lib/components/OtpForm.svelte` | de-box; `feedback` state; `shakeInvalid` + `pulseRunning` wiring | 4 |
| `src/lib/components/Turnstile.svelte` | internal `loaded` state + `Skeleton` overlay + `crossfadeSkeleton` | 5 |
| `src/lib/components/ResultPanel.svelte` | de-box; `data-motion` hooks; `revealResult` timeline | 6 |

Unchanged and not to be opened: `src/lib/cases.ts`, `src/lib/server/**`, `src/routes/api/**`, `src/lib/components/ui/**`, `tests/**`, `playwright.config.ts`.

---

## Task 1: `gsap` dependency and the motion module

Everything else consumes this. It lands first, with no component wired up yet, so a reviewer can judge the motion contract on its own.

**Files:**
- Create: `src/lib/motion.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `const DUR: { fast: 0.2; base: 0.4 }`
  - `const EASE: { out: 'power2.out'; loop: 'sine.inOut' }`
  - `type KillHandle = () => void`
  - `function prefersReducedMotion(): boolean`
  - `function shakeInvalid(el: HTMLElement | null): void`
  - `function settleValid(el: HTMLElement | null): void`
  - `function pulseRunning(el: HTMLElement | null): KillHandle`
  - `function crossfadeSkeleton(el: HTMLElement | null): KillHandle`
  - `function revealResult(root: HTMLElement | null): KillHandle`

- [ ] **Step 1: Load the GSAP skills**

Load `gsap-frameworks` (Svelte lifecycle and cleanup) and `gsap-core` (tween API) before writing the module. This plan's code is written against GSAP 3.15 core.

- [ ] **Step 2: Add the dependency**

`gsap` is shipped to the browser, so it is a runtime dependency, not a dev one.

```bash
bun add gsap
```

Confirm it landed under `"dependencies"` (not `"devDependencies"`) in `package.json`, and that the version is `^3.15.0` or newer.

- [ ] **Step 3: Write the module**

```ts
// src/lib/motion.ts
// Every tween in this app lives here. Components stay declarative: they call a
// named function from an $effect and invoke the returned handle on cleanup.
//
// Two hard rules, both from Playwright's actionability contract:
//   - GSAP animates `opacity` and `transform` only, never presence or text.
//   - Nothing that Playwright clicks (the submit button, a sidebar item) ever
//     gets a transform tween, because a moving bounding box is "not stable"
//     and would make `.click()` wait.
//
// A third rule from this project's token scale: GSAP never tweens a colour.
// The palette is oklch, which GSAP's colour parser cannot interpolate, so
// colour changes are done by toggling a Tailwind class and letting the
// primitives' own `transition-colors` ease them.
import { gsap } from 'gsap';

/** Shared durations, in seconds. `fast` is input feedback, `base` is a reveal. */
export const DUR = { fast: 0.2, base: 0.4 } as const;

/**
 * `out` is the shared ease for every directional tween.
 * `loop` is used only by the yoyo pulse — a yoyo on an `-out` ease reads
 * visibly uneven, so the one looping tween gets a symmetric ease.
 */
export const EASE = { out: 'power2.out', loop: 'sine.inOut' } as const;

export type KillHandle = () => void;

const NOOP: KillHandle = () => {};

/** Consulted by every exported function below. */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Invalid submit: a short decaying horizontal shake on the phone input.
 * The border colour is NOT handled here — OtpForm toggles a class for that.
 */
export function shakeInvalid(el: HTMLElement | null): void {
	if (!el) return;
	if (prefersReducedMotion()) {
		gsap.set(el, { clearProps: 'transform' });
		return;
	}
	gsap.fromTo(
		el,
		{ x: 0 },
		{
			keyframes: { x: [-6, 6, -4, 4, -2, 0] },
			duration: DUR.fast * 2,
			ease: EASE.out,
			clearProps: 'transform'
		}
	);
}

/** Valid submit: a barely-there settle. Opacity only — the accent border is a class. */
export function settleValid(el: HTMLElement | null): void {
	if (!el) return;
	if (prefersReducedMotion()) {
		gsap.set(el, { clearProps: 'opacity' });
		return;
	}
	gsap.fromTo(
		el,
		{ opacity: 0.82 },
		{ opacity: 1, duration: DUR.base, ease: EASE.out, clearProps: 'opacity' }
	);
}

/**
 * Submit button while `running`. Opacity only, never transform — this element
 * is a Playwright click target and a moving box would break `.click()`.
 * Kill the returned handle the instant `running` flips false.
 */
export function pulseRunning(el: HTMLElement | null): KillHandle {
	if (!el || prefersReducedMotion()) return NOOP;
	const tween = gsap.to(el, {
		opacity: 0.72,
		duration: DUR.base,
		ease: EASE.loop,
		repeat: -1,
		yoyo: true
	});
	// clearProps, not `opacity: 1` — the button's own `disabled:opacity-50`
	// has to win again once the inline style is gone.
	return () => {
		tween.kill();
		gsap.set(el, { clearProps: 'opacity' });
	};
}

/**
 * Turnstile skeleton. `autoAlpha` also sets `visibility: hidden` at 0, which
 * stops the faded skeleton from sitting over the widget and eating clicks.
 */
export function crossfadeSkeleton(el: HTMLElement | null): KillHandle {
	if (!el) return NOOP;
	if (prefersReducedMotion()) {
		gsap.set(el, { autoAlpha: 0 });
		return NOOP;
	}
	const tween = gsap.to(el, { autoAlpha: 0, duration: DUR.base, ease: EASE.out });
	return () => tween.kill();
}

/**
 * Result panel reveal. Fades and lifts the summary row, then starts the JSON
 * block a beat later on the same timeline. Targets are found by `data-motion`,
 * never `data-testid` — test hooks must not move.
 */
export function revealResult(root: HTMLElement | null): KillHandle {
	if (!root) return NOOP;
	const summary = root.querySelector<HTMLElement>('[data-motion="summary"]');
	const detail = root.querySelector<HTMLElement>('[data-motion="detail"]');
	const targets = [summary, detail].filter((el): el is HTMLElement => el !== null);
	if (targets.length === 0) return NOOP;

	if (prefersReducedMotion()) {
		gsap.set(targets, { clearProps: 'opacity,transform' });
		return NOOP;
	}

	const tl = gsap.timeline();
	if (summary) {
		tl.fromTo(
			summary,
			{ opacity: 0, y: 8 },
			{ opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: 'opacity,transform' },
			0
		);
	}
	if (detail) {
		tl.fromTo(
			detail,
			{ opacity: 0, y: 8 },
			{ opacity: 1, y: 0, duration: DUR.base, ease: EASE.out, clearProps: 'opacity,transform' },
			0.1
		);
	}

	return () => {
		tl.kill();
		gsap.set(targets, { clearProps: 'opacity,transform' });
	};
}
```

- [ ] **Step 4: Confirm it type-checks and does not break SSR**

```bash
bun run check
bun run dev
```

Expected: `bun run check` reports 0 errors, and `http://localhost:5173/?case=pass-visible` still renders exactly as before (nothing is wired up yet — this step is only proving the import is safe).

GSAP 3 guards its own `window` access, so a top-level `import { gsap } from 'gsap'` is SSR-safe. If the dev server or `bun run build` nonetheless throws on a `window`/`document` reference during SSR, do not add a browser guard at every call site — change the single import in `motion.ts` to a lazy one inside the functions and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock src/lib/motion.ts
git commit -m "feat: add gsap and the shared motion module"
```

---

## Task 2: Accent token and the sidebar as a table of contents

First visible change. The accent token lands here because the sidebar's active state is its first consumer.

No GSAP in this task — the sidebar's active item is a Playwright click target, so its state stays pure CSS (see Global Constraints, invariant 2).

**Files:**
- Modify: `src/app.css`, `src/routes/+layout.svelte`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities `bg-accent-brand`, `text-accent-brand`, `border-accent-brand`, `text-accent-brand-foreground`, usable in every later task.

- [ ] **Step 1: Add the token to both themes**

In `src/app.css`, add to the `:root` block (after `--destructive` on line 23, so the accent sits with the other semantic colours):

```css
	--accent-brand: oklch(0.5 0.09 275);
	--accent-brand-foreground: oklch(0.985 0 0);
```

And to the `.dark` block, after its `--destructive`:

```css
	--accent-brand: oklch(0.75 0.09 275);
	--accent-brand-foreground: oklch(0.205 0 0);
```

The two `--accent-brand` values are the spec's, verbatim. The `-foreground` pair is what makes the accent usable as a button fill: light mode's accent is dark (L 0.5) so its label is near-white; dark mode's is light (L 0.75) so its label is near-black.

The name is `--accent-brand`, **not** `--accent`. shadcn's `--accent` already means "neutral hover surface" throughout the generated primitives and must not be repurposed.

- [ ] **Step 2: Expose it to Tailwind v4**

In the `@theme inline` block, next to `--color-accent` (line 97):

```css
	--color-accent-brand: var(--accent-brand);
	--color-accent-brand-foreground: var(--accent-brand-foreground);
```

- [ ] **Step 3: Verify the utilities actually generate**

Tailwind v4 only emits a utility if the theme key is registered. Prove it before building anything on top:

```bash
bun run dev
```

Temporarily add `class="bg-accent-brand text-accent-brand-foreground"` to the `<h1>` in `src/routes/+layout.svelte`, confirm in the browser that it paints muted indigo in light mode and a lighter indigo in dark mode, then remove it again. If it stays transparent, the `@theme inline` entry is missing or misspelled.

- [ ] **Step 4: Re-skin the layout**

Replace the body of `src/routes/+layout.svelte` (keep the `<script>` block exactly as it is — no logic changes):

```svelte
<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<Sidebar.Provider>
	<Sidebar.Root class="border-r">
		<Sidebar.Header class="px-5 py-5">
			<h1 class="text-sm font-[650] tracking-tight">Turnstile OTP simulations</h1>
			<p class="text-xs text-muted-foreground">
				Cloudflare Turnstile · phone validation · rate limits
			</p>
		</Sidebar.Header>
		<Sidebar.Content class="px-2">
			{#each groups as group (group.group)}
				<Sidebar.Group>
					<Sidebar.GroupLabel
						class="px-3 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase"
					>
						{group.group}
					</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={item.id === activeId}
										class="relative h-auto rounded-none py-1.5 pl-4 font-normal text-muted-foreground transition-colors before:absolute before:top-1 before:bottom-1 before:left-0 before:w-px before:bg-transparent hover:bg-transparent hover:text-foreground data-active:bg-transparent data-active:font-medium data-active:text-foreground data-active:before:w-[2px] data-active:before:bg-accent-brand"
									>
										{#snippet child({ props })}
											<a href="/?case={item.id}" data-case={item.id} {...props}>
												<span>{item.title}</span>
												{#if item.manual}
													<Badge
														variant="outline"
														class="ml-auto border-border/60 text-[0.65rem] font-normal text-muted-foreground"
													>
														manual
													</Badge>
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

	<main class="flex-1 px-6 py-10 md:px-10">
		<Sidebar.Trigger class="mb-6 md:hidden" />
		{@render children?.()}
	</main>
</Sidebar.Provider>
```

What the `class` on `MenuButton` is doing, since it is dense:
- `data-active:bg-transparent` cancels the primitive's filled pill (`data-active:bg-sidebar-accent`). `cn()` is tailwind-merge, so the call-site class wins for the same property + variant.
- `before:*` is the hairline rail: always present at `w-px bg-transparent`, becoming `w-[2px] bg-accent-brand` when active. Keeping it present-but-invisible means the label never shifts horizontally.
- `font-normal` → `data-active:font-medium` is the weight-based hierarchy the spec asks for, and `text-muted-foreground` → `data-active:text-foreground` carries the rest.
- `rounded-none` and `hover:bg-transparent` remove the remaining pill chrome.
- The pseudo-element is painted inside an element whose width is fixed by the sidebar, so **the anchor's bounding box never changes** — invariant 2 holds and `.click()` stays instant.

- [ ] **Step 5: Autofix and check**

Run `mcp__plugin_svelte_svelte__svelte-autofixer` on `src/routes/+layout.svelte` until clean, then:

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 6: Look at it in both themes**

With `bun run dev` running, at `http://localhost:5173/`:
- the active case reads as a table-of-contents entry: a 2px indigo rail, slightly heavier label, no filled pill
- inactive items are muted and gain full foreground colour on hover, with no background
- toggle the OS/browser colour scheme: the accent lightens in dark mode and stays legible against the sidebar
- at 390px width the sidebar still collapses to a sheet via the trigger

- [ ] **Step 7: Prove the click target is unharmed**

```bash
bunx playwright test -g "pass-visible|invalid-phone"
```

Expected: 2 passed. These are the cheapest tests that exercise the `[data-case]` click.

- [ ] **Step 8: Commit**

```bash
git add src/app.css src/routes/+layout.svelte
git commit -m "feat: add muted indigo accent token and re-skin sidebar as a table of contents"
```

---

## Task 3: De-box the case card and set the page rhythm

The first of the three de-boxing passes. Vertical rhythm plus one hairline replaces the bordered box.

**Files:**
- Modify: `src/lib/components/CaseCard.svelte`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `--accent-brand` (Task 2).
- Produces: the section rhythm (`divide-y` + `py`) that Tasks 4 and 6 slot into. `data-testid="case-card"` and `data-testid="case-expectation"` stay exactly where they are, on the same elements.

- [ ] **Step 1: Rewrite `CaseCard.svelte`**

The `<script>` block is unchanged. Only the markup below it changes — `Card.*` goes away entirely, so drop that import.

```svelte
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { SimCase } from '$lib/cases';

	let { simCase }: { simCase: SimCase } = $props();

	const expectation = $derived(
		simCase.expected.widgetError
			? 'widget blocks the request'
			: `HTTP ${simCase.expected.status}${simCase.expected.errorCode ? ` · ${simCase.expected.errorCode}` : ''}`
	);
</script>

<section data-testid="case-card" class="flex flex-col gap-3">
	<div class="flex flex-col gap-1.5">
		<h2 class="text-lg font-[650] tracking-tight">{simCase.title}</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
			{simCase.description}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<span class="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
			Expected
		</span>
		<span data-testid="case-expectation" class="font-mono text-sm">{expectation}</span>
		{#if simCase.manual}
			<Badge variant="outline" class="border-border/60 text-[0.65rem] font-normal text-muted-foreground">
				manual
			</Badge>
		{/if}
		{#if simCase.repeat}
			<Badge variant="outline" class="border-border/60 text-[0.65rem] font-normal text-muted-foreground">
				×{simCase.repeat}
			</Badge>
		{/if}
	</div>
</section>
```

Note `data-testid="case-card"` moved from `Card.Root` onto the `<section>` that replaces it — same node in the tree, same visibility, so `expect(page.getByTestId('case-card')).toBeVisible()` is unaffected. The "Expected" `Badge` became a plain uppercase label; that is the de-chroming the spec asks for, and no test reads it.

- [ ] **Step 2: Set the page rhythm**

In `src/routes/+page.svelte`, the `<script>` block is unchanged. Replace the markup:

```svelte
<div class="mx-auto flex max-w-2xl flex-col divide-y divide-border">
	<div class="pb-8">
		<CaseCard {simCase} />
	</div>
	<div class="py-8">
		{#key simCase.id}
			<OtpForm {simCase} {sitekey} onresult={(r) => (result = r)} />
		{/key}
	</div>
	<div class="pt-8">
		<ResultPanel {simCase} {result} />
	</div>
</div>
```

`divide-y divide-border` is the single hairline between sections; `py-8` is the vertical rhythm that replaces the card boxes. The `{#key simCase.id}` wrapper stays — it is what remounts the form (and so resets its motion state) on a case change.

- [ ] **Step 3: Autofix and check**

Run the Svelte autofixer on both files until clean, then `bun run check`. Expected: 0 errors.

- [ ] **Step 4: Look at it**

At `http://localhost:5173/?case=pass-visible`: no card borders or shadows anywhere above the form, one hairline between each section, the title carries hierarchy by weight rather than by a box. Check dark mode too — `divide-border` in dark is `oklch(1 0 0 / 10%)`, which should read as a faint line, not a hard rule.

- [ ] **Step 5: Run the fast subset**

```bash
bunx playwright test -g "pass-visible|pass-invisible|widget-blocks|missing-token|invalid-phone|server-rejects|token-replay"
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/CaseCard.svelte src/routes/+page.svelte
git commit -m "feat: de-box the case card and set the page's vertical rhythm"
```

---

## Task 4: Form re-skin, validation shake and the running pulse

Two of the four motion moments land here. The critical decision in this task:

**The shake is driven by the server's response, never by client-side pre-validation.** There is no client-side phone validation today, and adding any would break the `invalid-phone` E2E case — that test asserts a `422` from the server, which requires the request to actually be sent. So `submit()` runs exactly as it does now, and the shake fires afterwards, off the status code.

Mapping: `422` → invalid (shake + destructive border). `200` → valid (settle + accent border). Everything else (`400`, `403`, `429`) is not a phone problem and gets no input feedback.

**Files:**
- Modify: `src/lib/components/OtpForm.svelte`

**Interfaces:**
- Consumes: `shakeInvalid`, `settleValid`, `pulseRunning` (Task 1); `--accent-brand` (Task 2).
- Produces: nothing new. `data-testid="phone-input"` and `data-testid="submit"` stay on the same elements with the same text and `disabled` behaviour.

- [ ] **Step 1: Add the refs and the feedback state**

In the `<script>` block of `src/lib/components/OtpForm.svelte`, add the import and four declarations. Everything already there stays.

```ts
	import { pulseRunning, settleValid, shakeInvalid } from '$lib/motion';
```

After the existing `let widgetFailed = $state(false);`:

```ts
	/** Element refs, for GSAP only. Never used to read or write form state. */
	let inputEl = $state<HTMLInputElement | null>(null);
	let submitEl = $state<HTMLElement | null>(null);

	/**
	 * Feedback for the phone field, decided by the server's status code.
	 * There is deliberately no client-side validation: the `invalid-phone` case
	 * asserts a 422 from the API, which means the request must actually be sent.
	 */
	let feedback = $state<'idle' | 'invalid' | 'valid'>('idle');
```

- [ ] **Step 2: Set `feedback` from the response**

Two edits inside `submit()`, both leaving the existing control flow intact.

At the top, right after the `widgetFailed` guard, clear the previous verdict:

```ts
		if (widgetFailed) return;
		feedback = 'idle';
		running = true;
```

And in the `try` block, after the loop and immediately before the existing `onresult({...})` call:

```ts
			const status = last?.status ?? null;
			feedback = status === 422 ? 'invalid' : status === 200 ? 'valid' : 'idle';

			onresult({
```

- [ ] **Step 3: Wire the two effects**

Add after `submit()`, still inside the `<script>` block:

```ts
	// Input feedback. Fires on the verdict changing, not on every render.
	$effect(() => {
		if (feedback === 'invalid') shakeInvalid(inputEl);
		else if (feedback === 'valid') settleValid(inputEl);
	});

	// The button pulse lives exactly as long as `running` is true; returning the
	// kill handle means Svelte tears it down the instant `running` flips back.
	$effect(() => {
		if (!running) return;
		return pulseRunning(submitEl);
	});
```

- [ ] **Step 4: Re-skin the markup**

```svelte
<form class="flex flex-col gap-5" method="dialog" onsubmit={submit}>
	<div class="flex flex-col gap-2">
		<label
			for="phone"
			class="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase"
		>
			Phone number
		</label>
		<Input
			id="phone"
			data-testid="phone-input"
			bind:ref={inputEl}
			bind:value={phone}
			name="phone"
			placeholder="08xx xxxx xxxx"
			autocomplete="tel"
			aria-label="Phone number"
			class={[
				'h-10 rounded-none border-0 border-b bg-transparent px-0 text-base shadow-none focus-visible:border-b-2 focus-visible:border-foreground focus-visible:ring-0',
				feedback === 'invalid' && 'border-destructive',
				feedback === 'valid' && 'border-accent-brand'
			]}
		/>
	</div>

	<Turnstile
		bind:this={widget}
		bind:token
		{sitekey}
		onerror={(code) => {
			widgetFailed = true;
			onresult({ status: null, body: null, elapsedMs: 0, attempts: 0, widgetError: code });
		}}
	/>

	<Button
		type="submit"
		data-testid="submit"
		bind:ref={submitEl}
		disabled={running}
		class="h-10 w-full rounded-md bg-accent-brand text-accent-brand-foreground transition-none hover:bg-accent-brand/90"
	>
		{running ? 'Running…' : `Request OTP${simCase.repeat ? ` ×${simCase.repeat}` : ''}`}
	</Button>
</form>
```

Three things here are load-bearing, not cosmetic:

- **`transition-none` on the Button is required, not a style choice.** The primitive's base class includes `transition-all`, which re-eases every frame GSAP writes and visibly smears the pulse. Removing it costs the button its hover fade, which suits the quieter direction anyway.
- **The button's class list contains no transform utility**, and `pulseRunning` animates `opacity` only. This element is a Playwright click target; a moving bounding box would make `.click()` wait (Global Constraints, invariant 2).
- **The input's border colour is a Tailwind class, not a GSAP tween.** The palette is oklch and GSAP cannot interpolate it. The primitive's own `transition-colors` eases the class swap; GSAP only supplies the shake.
- **`focus-visible:ring-0` alone is an accessibility regression, which is why it is paired here.** Dropping the ring on a border-bottom-only input leaves keyboard focus signalled by a 1px neutral border — a WCAG 2.4.7 contrast risk. `focus-visible:border-b-2 focus-visible:border-foreground` makes the underline itself the indicator. Do not remove the ring without replacing it with something of equal contrast.

The `aria-label` is kept alongside the new visible `<label>` so the accessible name does not change.

- [ ] **Step 5: Autofix and check**

Run the Svelte autofixer on `src/lib/components/OtpForm.svelte` until clean, then:

```bash
bun run check
```

Expected: 0 errors. If svelte-check objects to `bind:ref={submitEl}` because `Button`'s ref union is `HTMLButtonElement | HTMLAnchorElement`, widen the declaration to `let submitEl = $state<HTMLButtonElement | HTMLAnchorElement | null>(null)` rather than casting at the binding.

- [ ] **Step 6: Drive it by hand**

With `bun run dev`:
- `?case=invalid-phone` → submit → the field shakes once and its underline turns destructive; the result panel still shows `422 / invalid-phone`
- `?case=pass-visible` → submit → underline settles to indigo, result `200 / ok`
- `?case=per-phone` → submit → the button dims and pulses for the whole run, then stops the instant the result lands. Expect it to pulse between the disabled dimming and slightly brighter; if it instead reads as *brightening* from nothing, change `pulseRunning`'s `gsap.to` to `gsap.fromTo(el, { opacity: 1 }, { ... })` in `motion.ts`.
- In DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce", repeat all three: no shake, no pulse, same final colours and states.

- [ ] **Step 7: Run the fast subset**

```bash
bunx playwright test -g "pass-visible|pass-invisible|widget-blocks|missing-token|invalid-phone|server-rejects|token-replay"
```

Expected: 7 passed. `invalid-phone` and `missing-token` are the ones that would catch an accidental client-side validation guard.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/OtpForm.svelte
git commit -m "feat: de-box the OTP form, add validation shake and running pulse"
```

---

## Task 5: Turnstile skeleton cross-fade

The skeleton covers the widget slot from mount and fades out once the widget has rendered. The widget's own div and its `data-testid` are mounted at exactly the same instant as today — only the overlay's opacity is animated.

The skeleton lives **inside `Turnstile.svelte`** as internal state. The spec forbids changing `Turnstile`'s prop shape, so `loaded` must not become a prop.

**Files:**
- Modify: `src/lib/components/Turnstile.svelte`

**Interfaces:**
- Consumes: `crossfadeSkeleton` (Task 1).
- Produces: nothing new. Props stay `{ sitekey, token, onerror }`; `reset()` stays exported; `data-testid="turnstile-widget"` stays on the same div.

- [ ] **Step 1: Add the imports and state**

At the top of the `<script>` block:

```ts
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { crossfadeSkeleton } from '$lib/motion';
```

Alongside the existing `let widgetId`:

```ts
	/** Flips once the widget has been handed to Turnstile, or has failed. */
	let loaded = $state(false);
	/** Wrapper around the Skeleton — GSAP fades this, so the Skeleton's own
	 *  `animate-pulse` CSS animation is left free to keep shimmering underneath.
	 *  (A CSS animation outranks an inline style, so animating the Skeleton
	 *  itself would have GSAP and `animate-pulse` fighting over `opacity`.) */
	let skeletonEl = $state<HTMLDivElement | null>(null);
```

- [ ] **Step 2: Flip `loaded` on both outcomes**

Inside the existing `$effect`, after the `render` call and in the failure path:

```ts
				widgetId = window.turnstile.render(container, {
					sitekey: key,
					action: 'request-otp',
					callback: (t) => {
						token = t;
					},
					'error-callback': (code) => {
						token = '';
						loaded = true;
						onerror?.(String(code ?? 'widget-error'));
					}
				});
				loaded = true;
			})
			.catch((err: Error) => {
				loaded = true;
				onerror?.(err.message);
			});
```

Flipping `loaded` on the error path matters: the `widget-blocks` case never produces a token, and without this the skeleton would sit over a failed widget forever.

`render()` is synchronous and only runs once `loadScript()` has resolved, so `loaded = true` immediately after it covers the entire script-download gap — which is the part of the wait that is actually long.

- [ ] **Step 3: Add the fade effect**

After the existing `$effect`, before `export function reset()`:

```ts
	$effect(() => {
		if (!loaded) return;
		return crossfadeSkeleton(skeletonEl);
	});
```

No "show again" path is needed: a case change remounts `OtpForm` (it is wrapped in `{#key simCase.id}` in `src/routes/+page.svelte`), which remounts `Turnstile` with `loaded` back to `false` and a fresh, fully-opaque skeleton.

- [ ] **Step 4: Replace the markup**

```svelte
<div class="relative min-h-[65px]">
	<div bind:this={container} data-testid="turnstile-widget"></div>
	<div bind:this={skeletonEl} class="pointer-events-none absolute inset-0">
		<Skeleton class="h-full w-full rounded-md" />
	</div>
</div>
```

`min-h-[65px]` reserves the visible widget's height so the page does not jump when the iframe arrives. The invisible sitekey (`1x00000000000000000000BB`) leaves that slot empty — an acceptable 65px of quiet space, and far better than a layout shift mid-run.

`pointer-events-none` is belt-and-braces: `crossfadeSkeleton` uses `autoAlpha`, which also sets `visibility: hidden` at the end, but the overlay must not intercept the widget's own clicks even for the few hundred milliseconds before that. This matters for the manual `interactive` case, where a human has to click the challenge.

- [ ] **Step 5: Autofix and check**

Run the Svelte autofixer on `src/lib/components/Turnstile.svelte` until clean, then `bun run check`. Expected: 0 errors.

- [ ] **Step 6: Drive it by hand**

With `bun run dev`, and DevTools → Network throttled to "Slow 4G" so the gap is actually visible:
- `?case=pass-visible` → a shimmering block sits in the widget slot, then fades out as the widget appears
- `?case=widget-blocks` → the skeleton fades out rather than hanging around over the failed widget
- `?case=pass-invisible` → the skeleton fades and leaves an empty reserved slot; nothing below it jumps
- switch cases back and forth → the skeleton returns each time (the remount), it does not stay hidden
- with reduced motion emulated → the skeleton is simply gone, no fade

- [ ] **Step 7: Run the fast subset**

```bash
bunx playwright test -g "pass-visible|pass-invisible|widget-blocks|missing-token|invalid-phone|server-rejects|token-replay"
```

Expected: 7 passed. `widget-blocks` is the one at risk here — it asserts `widget-error` becomes visible and that no request was sent.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/Turnstile.svelte
git commit -m "feat: cover the Turnstile slot with a skeleton that cross-fades out"
```

---

## Task 6: De-box the result panel and reveal it on a timeline

The last de-boxing pass and the last motion moment.

**Files:**
- Modify: `src/lib/components/ResultPanel.svelte`

**Interfaces:**
- Consumes: `revealResult` (Task 1); `--accent-brand` (Task 2).
- Produces: nothing new. `data-testid` on `result-panel`, `result-status`, `result-error` and `widget-error` all stay on the same elements with the same text. The new `data-motion="summary"` / `data-motion="detail"` hooks are what GSAP targets — **no test hook is reused for animation**.

- [ ] **Step 1: Add the import, ref and effect**

In the second `<script>` block, add the import:

```ts
	import { revealResult } from '$lib/motion';
```

Alongside `let resetting = $state(false);`:

```ts
	/** Root element, so `revealResult` can find its `data-motion` targets. */
	let rootEl = $state<HTMLElement | null>(null);
```

And after `resetQuota()`:

```ts
	// Reveal whenever a result arrives. `result` is reset to null on every case
	// change (see src/routes/+page.svelte), so this re-fires per run.
	$effect(() => {
		if (!result) return;
		return revealResult(rootEl);
	});
```

- [ ] **Step 2: Replace the markup**

```svelte
<section bind:this={rootEl} data-testid="result-panel" class="flex flex-col gap-4">
	<h2 class="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">Result</h2>

	{#if !result}
		<p class="text-sm text-muted-foreground">Submit the form to run this case.</p>
	{:else if result.widgetError}
		<div data-motion="summary" class="flex flex-col gap-2">
			<div class="flex items-center gap-2.5">
				<span class="size-1.5 rounded-full bg-destructive"></span>
				<span class="text-sm font-medium">widget blocked</span>
				<span data-testid="widget-error" class="font-mono text-sm text-muted-foreground">
					{result.widgetError}
				</span>
			</div>
			<p class="text-sm text-muted-foreground">No request was sent to the server.</p>
		</div>
	{:else}
		<div data-motion="summary" class="flex flex-col gap-2">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span
					data-testid="result-status"
					class="font-mono text-2xl font-[650] tabular-nums"
					class:text-accent-brand={result.status === 200}
					class:text-destructive={result.status !== 200}
				>
					{result.status}
				</span>
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
		</div>

		<pre
			data-motion="detail"
			class="overflow-x-auto border-l border-border py-1 pl-4 font-mono text-xs leading-relaxed text-muted-foreground">{JSON.stringify(
				result.body,
				null,
				2
			)}</pre>
	{/if}

	{#if simCase.group === 'Rate limit'}
		<div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
			{#if quota}
				<span class="text-xs text-muted-foreground">
					remaining — phone {quota.phone.remaining}/{quota.phone.limit}, ip {quota.ip.remaining}/{quota
						.ip.limit}
				</span>
			{/if}
			<Button
				size="sm"
				variant="outline"
				disabled={resetting}
				onclick={resetQuota}
				class="border-border/60 font-normal"
			>
				Reset this case's quota
			</Button>
			{#if resetMessage}<span class="text-xs text-muted-foreground">{resetMessage}</span>{/if}
		</div>
	{/if}
</section>
```

What changed and why it is safe:
- `Card.*` is gone — drop the `import * as Card` line. `data-testid="result-panel"` moved to the `<section>` that replaces `Card.Root`: same position in the tree, same visibility.
- The status `Badge` became a large mono numeral tinted by `--accent-brand` on success and `--destructive` otherwise. `data-testid="result-status"` is on that element and its text is still exactly `{result.status}`, which is what `toHaveText` compares.
- The `<pre>` lost its filled `bg-muted` box for a left hairline — the de-boxing the spec asks for.
- **The `<pre>` is written with its content flush against the tags.** A `<pre>` preserves whitespace, so re-indenting that line would inject leading spaces into the rendered JSON. Keep the awkward formatting; if the autofixer or a formatter reflows it, put it back.
- `data-motion="summary"` and `data-motion="detail"` are new attributes for GSAP only.

- [ ] **Step 3: Confirm the reveal cannot break the assertions**

Worth reasoning through once, because this is the task most likely to look scary:
- `result-status` and `result-error` are inside `[data-motion="summary"]`, which animates from `opacity: 0, y: 8`. `toHaveText` does not require visibility or stability, so it is unaffected.
- `widget-error` is inside a `[data-motion="summary"]` too, and its test uses `toBeVisible()`. Per Playwright's docs, *"Elements with `opacity:0` are considered visible"* — so the fade is invisible to that assertion. The `y` tween changes the bounding box, but stability is only required for actions like `.click()`, and nothing in the suite clicks inside the result panel.

- [ ] **Step 4: Autofix and check**

Run the Svelte autofixer on `src/lib/components/ResultPanel.svelte` until clean, then `bun run check`. Expected: 0 errors.

- [ ] **Step 5: Drive it by hand**

With `bun run dev`:
- `?case=pass-visible` → submit → the summary lifts and fades in, the JSON follows a beat later
- `?case=server-rejects` → the status reads destructive, error codes appear
- `?case=widget-blocks` → the "widget blocked" row fades in; no JSON block
- `?case=per-phone` → the quota row and reset button still work after a run
- reduced motion emulated → everything appears at once, fully opaque, no lift
- check both themes: the `<pre>` hairline and the accent numeral must both read correctly in dark mode

- [ ] **Step 6: Run the fast subset**

```bash
bunx playwright test -g "pass-visible|pass-invisible|widget-blocks|missing-token|invalid-phone|server-rejects|token-replay"
```

Expected: 7 passed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ResultPanel.svelte
git commit -m "feat: de-box the result panel and reveal it on a GSAP timeline"
```

---

## Task 7: Full verification and deploy

Everything up to here was verified against a fast subset. This task runs the real thing, checks the axes a subset cannot (both themes, phone width, reduced motion, the manual cases), and ships it.

**Files:**
- Modify: none, unless verification turns something up.

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: a deployed Pages build of the redesign.

- [ ] **Step 1: The full automated suite**

```bash
bun run check
bun run test:unit
bun run test:e2e
```

Expected: 0 type errors; all unit tests green; **all 9 Playwright tests green with `tests/e2e/cases.spec.ts` unmodified**. Confirm the file really is untouched:

```bash
git diff --stat HEAD -- tests/ playwright.config.ts
```

Expected: no output. If this plan has forced a test change, that is a spec violation — stop and report it rather than editing the test.

- [ ] **Step 2: The two slow cases specifically**

`per-phone` and `per-ip` are the only tests that click submit once and then sit through 4 and 11 round trips. They are the real exercise of `pulseRunning`'s lifetime, and the only ones that would expose a pulse that outlives `running` or a tween leaking between attempts.

```bash
bunx playwright test -g "per-phone|per-ip"
```

Expected: 2 passed. Then run `?case=per-ip` by hand and watch the button: it must pulse continuously for the whole ~11-request run and stop dead the moment the result appears.

- [ ] **Step 3: Both themes, every case**

With `bun run dev`, click every one of the eleven sidebar entries in light mode, then switch the OS/browser to dark and do it again. Looking for:
- no leftover card borders, shadows or filled boxes anywhere
- the indigo accent appears in exactly three places — active sidebar rail, submit button, success status — and nowhere else
- errors stay on `--destructive`, never the accent
- the mono/sans contrast still separates technical output from prose
- nothing is low-contrast in either theme, especially the `--accent-brand` fill against its `-foreground`

- [ ] **Step 4: Phone width**

DevTools at 390px:
- the sidebar collapses to a sheet and the trigger opens it
- no horizontal page scroll
- the result panel's `<pre>` scrolls inside itself rather than widening the page
- the submit button is full-width and comfortably tappable

- [ ] **Step 5: Reduced motion, end to end**

DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce", then walk `pass-visible`, `invalid-phone`, `widget-blocks` and `per-phone`:
- no shake, no pulse, no fade, no lift anywhere
- every end state is identical to the animated version — same colours, same layout, nothing stuck at partial opacity or offset
- the skeleton disappears rather than lingering

This is the check that catches a missing `prefersReducedMotion()` gate, since the gate is the only thing standing between reduced-motion users and every tween.

- [ ] **Step 6: The two manual cases**

```bash
# with the dev server running
```

- `?case=interactive` → the skeleton fades, a real challenge appears, and **you can click it** — this is what `pointer-events-none` on the skeleton overlay protects. Complete it and confirm a `200`.
- `?case=real-keys` → only meaningful on the deployment with real keys configured. If the project is still on the test secret, note it as expected-red rather than a regression.

- [ ] **Step 7: Build and deploy**

```bash
bun run build
bunx wrangler pages deploy
```

Then open the deployed URL and re-run Step 3's spot check (a few cases in both themes) and Step 6's `interactive` case against production.

- [ ] **Step 8: Commit and push**

The working tree has untracked `.agents/`, `.claude/` and `skills-lock.json` that predate this work. **Do not use `git add -A`** — stage explicitly, as every task in this plan already does.

```bash
git status --short
git log --oneline -7
git push origin main
```

If Steps 1–6 produced any fixes, commit them first with a `fix:` message scoped to what changed.

- [ ] **Step 9: Watch CI, which is the real gate**

`.github/workflows/ci.yml` runs on every push to `main`: a `validate` job (`bun install --frozen-lockfile` → `check` → `test:unit` → `build`) and then an `e2e` job running the full Playwright suite on Ubuntu with `CI=1`.

```bash
gh run watch
```

Two failure modes this plan can cause, and neither shows up locally:

- **`bun install --frozen-lockfile` fails** → `bun.lock` was not committed with the `gsap` addition. Task 1 Step 5 stages it; if it was missed, commit it now.
- **A test that is green locally fails in `e2e`** → almost always a timing assumption. CI machines are slower and `reuseExistingServer` is off there, so a tween that races a Playwright assertion locally has more room to lose in CI. Re-read the three invariants; the fix is in the animation, not the test.

Do not consider the task done until both CI jobs are green.

---

## Acceptance — the redesign is done when all of these hold

- [ ] `git diff --stat HEAD~7 -- tests/ playwright.config.ts src/lib/cases.ts src/lib/server/ src/routes/api/ src/lib/components/ui/` is empty — nothing out of scope was touched
- [ ] `bun run check` reports 0 errors
- [ ] `bun run test:unit` is green
- [ ] `bun run test:e2e` is green for all 9 non-manual cases, with the spec file unmodified
- [ ] No `Card.*` import remains in `CaseCard.svelte` or `ResultPanel.svelte`; no bordered/shadowed box survives in the main panel
- [ ] The sidebar's active item is a left accent rail plus a weight bump, not a filled pill
- [ ] `--accent-brand` exists in `:root`, `.dark` and `@theme inline`, and is used only for the active sidebar rail, the submit button, the success status and the valid-input border
- [ ] All four motion moments animate: input shake on 422, input settle on 200, button pulse while running, skeleton cross-fade, result reveal with the `<pre>` a beat behind
- [ ] Every one of those is silent under `prefers-reduced-motion: reduce`, with identical end states
- [ ] No `data-testid` was renamed, moved to a different element, or reused as an animation hook
- [ ] `gsap` is in `dependencies`; no GSAP plugin was added; no other new dependency
- [ ] Both themes and 390px width verified across all eleven cases
- [ ] The `interactive` challenge is clickable through the skeleton overlay
- [ ] Both CI jobs (`validate` and `e2e`) green on `main`, with `bun.lock` committed
- [ ] Deployed and spot-checked in production

---

## Notes for the executor

- **The suite is the contract.** If a Playwright test fails, the redesign is wrong — never the test. `tests/` and `playwright.config.ts` are out of scope in every task.
- **The three invariants in Global Constraints are the whole reason this plan is shaped the way it is.** Before adding any tween the plan does not list, check it against them: opacity is free, transform is forbidden on the two click targets, and nothing may gate presence or text.
- **GSAP never tweens a colour here.** That is not a stylistic preference — the token scale is oklch and GSAP's colour parser cannot interpolate it. If a colour needs to move, toggle a Tailwind class and let `transition-colors` do it.
- **Do not add client-side phone validation.** It would be the natural way to drive the shake and it would break `invalid-phone`, which requires the request to reach the server and come back 422.
- **`src/lib/components/ui/**` stays untouched.** If a primitive seems to need a change, it almost certainly needs a call-site class instead — `cn()` is tailwind-merge and the call site wins.
- **If a visual choice in this plan reads badly in the browser, adjust it** (spacing, weights, sizes) and say so in the commit. The invariants and the token values are fixed; the taste is not. If the *spec* looks wrong rather than stale, stop and send the question to `thinker`.
