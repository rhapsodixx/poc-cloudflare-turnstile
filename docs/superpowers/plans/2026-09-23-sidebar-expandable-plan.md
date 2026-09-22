# Sidebar: Inline Expandable on Mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session rule (project-specific):** executed by the `executor` session only. See `CLAUDE.md`. Design questions go to `thinker`; do not redesign in place.

**Goal:** Below 768px, render the sidebar as an inline panel that is expanded on first load and collapses in place, instead of a modal `Sheet` overlay that starts closed. Desktop is untouched and `bun run test:e2e` stays green unmodified.

**Architecture:** A three-file change inside the vendored `src/lib/components/ui/sidebar/` primitive. `context.svelte.ts` flips `openMobile`'s default; `sidebar.svelte`'s `isMobile` branch swaps `Sheet.Root`/`Sheet.Content` for a plain grid container whose `grid-template-rows` transitions between `0fr` and `1fr`; `sidebar-provider.svelte` stacks its flex children vertically below `md` so the panel sits above the main content rather than beside it. No JavaScript animation, no new dependency, no change to `+layout.svelte`.

**Tech Stack:** Existing SvelteKit 2 / Svelte 5.56 / Tailwind v4 / shadcn-svelte stack. Nothing added.

**Spec:** `docs/superpowers/specs/2026-09-23-sidebar-expandable-design.md` — read it alongside this plan.

---

## Prerequisite — do not start this plan yet

The spec gates this work on Task 7 of `docs/superpowers/plans/2026-09-23-minimalist-redesign-plan.md` having landed, verified and deployed. That plan is in flight (Task 3 committed at `e5c40bc`). Task 1 Step 1 below is the gate check; do not skip it.

---

## Global Constraints

### What protects the test suite

`tests/e2e/cases.spec.ts` runs at Playwright's default desktop viewport (1280×720), where `IsMobile` is false and this change is inert. That is the whole safety argument, and it holds only under one rule:

**Exactly one branch of `sidebar.svelte` may render at a time.** The suite does `page.locator('[data-case="${simCase.id}"]').click()`, which is a strict-mode locator — it fails if two elements match. The sidebar's children include every `data-case` anchor. So rendering the mobile panel and the desktop panel simultaneously (for example, emitting both and hiding one with `hidden md:block`) would put two copies of each `data-case` in the DOM and break all nine tests, whether or not one copy is visible. Keep the `{#if collapsible === "none"} / {:else if sidebar.isMobile} / {:else}` structure exactly as it is: one branch, chosen in JS.

### Scope

- **Three files, all under `src/lib/components/ui/sidebar/`:** `context.svelte.ts`, `sidebar.svelte`, `sidebar-provider.svelte`. Nothing else.
- **Do not touch** `src/routes/+layout.svelte`, `src/lib/cases.ts`, anything under `src/lib/server/`, `src/routes/api/**`, or any file in `tests/`.
- **Do not change sidebar visual styling** — the accent rail, spacing and typography from the minimalist redesign stay exactly as they are. This is behaviour only.
- **Do not add a dependency.** The expand/collapse is a CSS transition.
- **Do not delete `src/lib/components/ui/sheet/**`.** It becomes unused by the sidebar, but removing it is out of scope.
- **Desktop must be pixel-identical.** The `{:else}` branch of `sidebar.svelte` is not edited.

### Departures from the spec, all deliberate

The spec names two files; this plan touches three, and adds two small things it does not mention. Each is flagged at the step that introduces it, and listed here so a reviewer sees them together:

- **`sidebar-provider.svelte` is a third file (Task 1 Step 5).** Its wrapper is `flex`, i.e. `flex-row`. Today the `Sheet` portals out of that flow, so `<main>` is the only flex child on mobile; an inline panel dropped into the same row would sit *beside* the content, not above it. Spec §3 requires it to "push the main content down", which needs `flex-col` below `md`. Still inside the primitive, so the spec's "do not touch `+layout.svelte`" holds.
- **The mobile panel moves the hairline from its right edge to its bottom (Task 1 Step 3).** The call site sets `border-r` for the desktop column; stacked, that reads as a stray vertical rule. This brushes against spec §5's "do not change sidebar visual styling", so treat it as adjustable: if a reviewer prefers the untouched class, drop the two utilities and nothing else changes.
- **Task 2 adds an `$effect` and a mount flag.** Spec §4 asks to confirm "no flash of full-height then snap", which the hydration boundary makes unavoidable without it. The task is separated precisely so it can be rejected on its own.
- **`data-state` is set on the mobile panel (Task 1 Step 3).** Parity with the desktop branch, which already sets it. Nothing reads it.

### A consequence worth recording

This plan edits generated shadcn-svelte primitives. After it lands, `bunx shadcn-svelte add sidebar` would overwrite these three files and silently restore the overlay. The spec accepts this — `Sidebar.Root` has exactly one consumer in this app, and the alternative duplicated the render logic. Task 3 records it in the README so a future contributor does not lose the change to a regeneration.

### Conventions

- Commit messages: Conventional Commits. Commit at the end of every task.
- **Run the Svelte MCP autofixer (`mcp__plugin_svelte_svelte__svelte-autofixer`) on every changed `.svelte` file**, re-running until clean. Prefer the `svelte:svelte-file-editor` agent.
- Context7 MCP before memory for Svelte 5 and Tailwind v4 APIs.
- The working tree has untracked `.agents/`, `.claude/` and `skills-lock.json` that predate this work. **Do not use `git add -A`** — stage explicitly, as every task below does.

### Verification commands

```bash
bun run check        # svelte-check, must stay at 0 errors
bun run test:unit    # untouched by this plan; must stay green
bun run test:e2e     # full suite, must stay green with tests/ unmodified
```

Mobile behaviour has no automated coverage by design (spec §4) — it is verified in DevTools device emulation, the same way this project already handles the `interactive` and `real-keys` cases.

---

## File Structure

| File | Change | Task |
|---|---|---|
| `src/lib/components/ui/sidebar/context.svelte.ts` | `openMobile` default `false` → `true` | 1 |
| `src/lib/components/ui/sidebar/sidebar.svelte` | mobile branch: `Sheet` → inline grid panel; drop two now-unused imports | 1 |
| `src/lib/components/ui/sidebar/sidebar-provider.svelte` | wrapper stacks `flex-col` below `md` | 1 |
| `src/lib/components/ui/sidebar/sidebar.svelte` | mount-frame entrance so hydration does not snap the page | 2 |
| `README.md` | note that the sidebar primitive is hand-edited | 3 |

---

## Task 1: Replace the mobile overlay with an inline expandable panel

The whole behaviour change. All three files move together because none of them is observable on its own: flipping the default without replacing the `Sheet` just opens a modal on load, and replacing the `Sheet` without fixing the wrapper's flex direction puts the panel *beside* the main content instead of above it.

**Files:**
- Modify: `src/lib/components/ui/sidebar/context.svelte.ts`, `src/lib/components/ui/sidebar/sidebar.svelte`, `src/lib/components/ui/sidebar/sidebar-provider.svelte`

**Interfaces:**
- Consumes: nothing new.
- Produces: no API change. `Sidebar.Root`, `Sidebar.Trigger`, `useSidebar()`, `toggle()`, `setOpenMobile()` and the `Cmd/Ctrl+B` shortcut all keep their current signatures and behaviour; only the mobile rendering and the initial `openMobile` value differ.

- [ ] **Step 1: Check the prerequisite gate**

```bash
git log --oneline -12
git status --short
```

Task 7 of the minimalist redesign must have landed — that means its verification and deploy steps are done, not merely that Task 6 is committed. If the last redesign commit is anything earlier, **stop here and report that this plan is still blocked.** Do not start and do not interleave.

Also confirm the tree is clean apart from the three known untracked paths.

- [ ] **Step 2: Flip the mobile default**

In `src/lib/components/ui/sidebar/context.svelte.ts`, line 26:

```ts
	openMobile = $state(false);
```

becomes:

```ts
	// Expanded on first load: on narrow viewports this panel is inline, not a
	// modal, so showing the case list by default is how the user discovers the
	// options. Hand-edited against the generated primitive — see README.
	openMobile = $state(true);
```

Nothing else in this file changes. `toggle()`, `setOpenMobile()` and `handleShortcutKeydown` keep working; they simply start from the opposite value.

- [ ] **Step 3: Replace the mobile branch**

In `src/lib/components/ui/sidebar/sidebar.svelte`, replace the entire `{:else if sidebar.isMobile}` branch (lines 36–58, the `Sheet.Root` block) with:

```svelte
{:else if sidebar.isMobile}
	<!--
		Inline, not a modal. Below `md` this panel sits in normal document flow
		above the main content and expands/collapses by transitioning the grid
		row between 0fr and 1fr — which animates to the content's exact height
		with no magic max-height number, and needs no JS.
		No backdrop, no focus trap, no scroll lock: those are dialog behaviours
		and this is not a dialog any more.
	-->
	<div
		bind:this={ref}
		data-sidebar="sidebar"
		data-slot="sidebar"
		data-mobile="true"
		data-state={sidebar.openMobile ? "expanded" : "collapsed"}
		class={cn(
			"grid w-full bg-sidebar text-sidebar-foreground transition-[grid-template-rows] duration-200 ease-linear",
			sidebar.openMobile ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			className,
			// After `className` on purpose: the call site sets `border-r` for the
			// desktop column, which reads as a stray vertical rule once the panel
			// is stacked. Same hairline, correct edge.
			"border-r-0 border-b"
		)}
		{...restProps}
	>
		<div class="flex min-h-0 w-full flex-col overflow-hidden">
			{@render children?.()}
		</div>
	</div>
```

The inner wrapper carries `min-h-0 overflow-hidden`, which is what makes a `0fr` grid row actually clip its content rather than overflow it — the standard requirement for this technique.

Animating `grid-template-rows` between `fr` units needs Chrome 107+ / Safari 16+ / Firefox 120+. All are long since shipped, and the degradation on anything older is graceful anyway: the panel still expands and collapses correctly, just instantly. No fallback is warranted.

`data-state` is new and is there for parity with the desktop branch (which already sets it); nothing reads it yet.

- [ ] **Step 4: Drop the two imports the branch no longer uses**

At the top of `src/lib/components/ui/sidebar/sidebar.svelte`, delete lines 2 and 4:

```ts
	import * as Sheet from "$lib/components/ui/sheet/index.js";
	import { SIDEBAR_WIDTH_MOBILE } from "./constants.js";
```

`cn`, `useSidebar` and the type imports all stay. Leave `src/lib/components/ui/sheet/**` and `constants.ts` themselves alone — `SIDEBAR_WIDTH_MOBILE` simply becomes an unused export, which is fine for a vendored primitive.

- [ ] **Step 5: Stack the wrapper below `md`**

This is the step the spec does not call out, and without it the panel renders *beside* the main content instead of above it.

`src/lib/components/ui/sidebar/sidebar-provider.svelte` line 45 is the flex container that holds `Sidebar.Root` and `<main>`:

```ts
			"group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
```

becomes:

```ts
			// `flex-col` below `md` so the mobile sidebar stacks above the main
			// content. Previously irrelevant: the Sheet portaled out of this flow,
			// so `<main>` was the only flex child on mobile.
			"group/sidebar-wrapper flex min-h-svh w-full flex-col md:flex-row has-data-[variant=inset]:bg-sidebar",
```

Desktop is unaffected — `flex` already means `flex-row`, and `md:flex-row` restores it explicitly above the breakpoint.

- [ ] **Step 6: Autofix and type-check**

Run the Svelte autofixer on `sidebar.svelte` and `sidebar-provider.svelte` until clean, then:

```bash
bun run check
```

Expected: 0 errors. An "unused import" complaint means Step 4 was missed.

- [ ] **Step 7: Verify the mobile behaviour by hand**

```bash
bun run dev
```

In DevTools device emulation at 390px wide (iPhone 14 or similar), on `http://localhost:5173/`:
- on first load the case list is **visible and expanded**, stacked above the case card — no tap needed
- there is **no backdrop and no dimming**; the page scrolls normally behind nothing
- tapping the hamburger `Sidebar.Trigger` collapses the panel smoothly and the content below slides up; tapping again expands it
- collapsed state hides the list completely with no sliver of clipped text
- tapping a case still navigates and the panel stays as it was
- the hairline now sits along the panel's bottom edge, not its right

Known and expected at this step: on first load the panel appears a beat after the rest of the page and shoves the content down. That is the hydration jump; Task 2 fixes it. Do not chase it here.

- [ ] **Step 8: Verify desktop is untouched**

Resize above 768px, or turn device emulation off:
- the sidebar is a left column exactly as before, with the accent rail, spacing and typography from the redesign unchanged
- the `border-r` hairline is back on the right edge
- the hamburger is hidden (`md:hidden` at the call site)
- `Cmd/Ctrl+B` still collapses and expands the desktop sidebar

- [ ] **Step 9: Run the full suite**

```bash
bun run test:unit
bun run test:e2e
git diff --stat HEAD -- tests/ playwright.config.ts
```

Expected: unit green, all 9 Playwright tests green, and **no output from the diff** — the tests must not have been touched. A strict-mode locator error naming `[data-case=...]` means two branches are rendering at once; re-read Global Constraints.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/ui/sidebar/context.svelte.ts \
        src/lib/components/ui/sidebar/sidebar.svelte \
        src/lib/components/ui/sidebar/sidebar-provider.svelte
git commit -m "feat: render the mobile sidebar inline and expanded instead of as an overlay"
```

---

## Task 2: Smooth the hydration entrance

Independently rejectable: a reviewer may decide the jump is acceptable for a PoC and drop this task. It is separated for exactly that reason.

**The problem, precisely.** `IsMobile` extends Svelte's `MediaQuery`, and `IsMobile`'s constructor passes no server fallback — so `sidebar.isMobile` is falsy during SSR and the server renders the **desktop** branch, whose outer div is `hidden md:block` and therefore invisible at phone width. At hydration the media query resolves true, the mobile branch mounts already at `grid-rows-[1fr]`, and the page content below is shoved down in a single frame.

Rendering both branches to avoid this is not available — it would duplicate every `data-case` and break the suite (Global Constraints). So the fix is to make the entrance deliberate: mount collapsed, then expand on the next animation frame, reusing the transition Task 1 already built.

**Files:**
- Modify: `src/lib/components/ui/sidebar/sidebar.svelte`

**Interfaces:**
- Consumes: the `grid-rows-[0fr]`/`grid-rows-[1fr]` transition from Task 1.
- Produces: no API change.

- [ ] **Step 1: Add the mount flag**

In the `<script>` block of `src/lib/components/ui/sidebar/sidebar.svelte`, after `const sidebar = useSidebar();`:

```ts
	/**
	 * The media query is false on the server, so the mobile branch only mounts at
	 * hydration — already expanded, which snaps the page down in one frame.
	 * Holding it collapsed for a single frame lets the grid transition from
	 * Task 1 run, turning that snap into a deliberate reveal.
	 */
	let entered = $state(false);

	$effect(() => {
		const frame = requestAnimationFrame(() => (entered = true));
		return () => cancelAnimationFrame(frame);
	});
```

This effect reads nothing reactive, so it runs once on mount and never re-runs.

- [ ] **Step 2: Gate the expanded row on it**

In the mobile branch's `cn(...)`, change:

```ts
			sidebar.openMobile ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
```

to:

```ts
			sidebar.openMobile && entered ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
```

- [ ] **Step 3: Autofix and type-check**

Autofixer on `sidebar.svelte` until clean, then `bun run check`. Expected: 0 errors.

- [ ] **Step 4: Verify the entrance**

At 390px, hard-reload (`Cmd+Shift+R`) a few times and watch the top of the page:
- the panel opens smoothly from zero height rather than appearing at full height
- the content below slides down with it; nothing flashes at full height first
- throttle the CPU to 4× in DevTools Performance and reload again — the reveal should still read as an animation, not a snap

If it still snaps, the single `requestAnimationFrame` is being coalesced with the mount paint. Nest a second one:

```ts
		const frame = requestAnimationFrame(() =>
			requestAnimationFrame(() => (entered = true))
		);
```

- [ ] **Step 5: Verify the toggle still works and desktop is unaffected**

- at 390px, collapse and expand with the trigger several times — `entered` stays true, so only `openMobile` drives it
- above 768px, nothing changes: `entered` is unused by the desktop branch

- [ ] **Step 6: Run the full suite**

```bash
bun run test:e2e
```

Expected: 9 passed. The desktop branch never reads `entered`, so this should be inert — but run it, because `$effect` in a primitive is the kind of change that surprises.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ui/sidebar/sidebar.svelte
git commit -m "fix: expand the mobile sidebar on the frame after hydration instead of snapping"
```

---

## Task 3: Document, verify across themes, and deploy

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: a deployed build, and a README note that survives a future contributor reaching for the shadcn generator.

- [ ] **Step 1: Record that the primitive is hand-edited**

This is the one piece of debt this plan knowingly takes on, so it gets written down rather than remembered. Add to `README.md`, under the existing "Known limits" section:

```markdown
- `src/lib/components/ui/sidebar/` is **hand-edited**, not stock shadcn-svelte.
  Below 768px the sidebar renders as an inline panel that starts expanded,
  instead of the generated `Sheet` overlay that starts closed — see
  `docs/superpowers/specs/2026-09-23-sidebar-expandable-design.md`. Three files
  carry the change: `sidebar.svelte` (mobile branch), `context.svelte.ts`
  (`openMobile` default) and `sidebar-provider.svelte` (stacking below `md`).
  Running `bunx shadcn-svelte add sidebar` would overwrite all three and
  silently restore the overlay.
```

- [ ] **Step 2: Both themes, both viewports**

With `bun run dev`, walk a few cases in each of the four combinations — 390px and desktop, light and dark:
- the mobile panel uses `bg-sidebar` and reads correctly in dark mode, with the bottom hairline visible but not harsh
- the accent rail on the active case still shows at mobile width
- no horizontal scroll at 390px
- the collapsed panel leaves no visible sliver in either theme

- [ ] **Step 3: Full automated suite, one last time**

```bash
bun run check
bun run test:unit
bun run test:e2e
git diff --stat HEAD~2 -- tests/ playwright.config.ts src/routes/ src/lib/cases.ts src/lib/server/
```

Expected: everything green, and the diff empty — proof that nothing outside `src/lib/components/ui/sidebar/` and `README.md` moved.

- [ ] **Step 4: Build and deploy**

```bash
bun run build
bunx wrangler pages deploy
```

Open the deployed URL on a real phone if one is handy, or in device emulation otherwise, and re-check Step 2's list. A real device is worth it here: emulation does not reproduce mobile Safari's viewport behaviour, and `min-h-svh` on the wrapper is exactly the kind of thing that behaves differently there.

- [ ] **Step 5: Commit and push, then watch CI**

```bash
git add README.md
git commit -m "docs: note that the sidebar primitive is hand-edited"
git status --short
git push origin main
gh run watch
```

`.github/workflows/ci.yml` runs `check` → `test:unit` → `build`, then the full Playwright suite with `CI=1`. Both jobs must be green before this is done.

---

## Acceptance — the change is done when all of these hold

- [ ] At <768px, first load shows the case list inline and expanded, with no tap and no backdrop
- [ ] The trigger collapses and expands the panel in place; page content is never covered
- [ ] The panel animates open on load rather than snapping the page down
- [ ] Desktop at ≥768px is visually identical to before, including the accent rail and the right-edge hairline
- [ ] `Cmd/Ctrl+B` still works on both sides of the breakpoint
- [ ] `bun run check` reports 0 errors
- [ ] `bun run test:unit` and `bun run test:e2e` are green, with `tests/` and `playwright.config.ts` unmodified
- [ ] Only `src/lib/components/ui/sidebar/{context.svelte.ts,sidebar.svelte,sidebar-provider.svelte}` and `README.md` changed
- [ ] No new dependency; `src/lib/components/ui/sheet/**` still present and untouched
- [ ] Both themes checked at both viewports
- [ ] README records that the sidebar primitive is hand-edited
- [ ] Deployed, and both CI jobs green on `main`

---

## Notes for the executor

- **Do not start before the redesign plan's Task 7 has landed.** Task 1 Step 1 is the gate.
- **One branch of `sidebar.svelte` renders at a time.** This is the single rule that keeps the Playwright suite green; the temptation to render both and switch with CSS would duplicate every `data-case` and fail all nine tests on a strict-mode locator.
- **This plan deliberately edits generated primitives.** That was settled in the spec — one consumer, no duplication. Task 3 Step 1 writes down the consequence; do not skip it.
- **Task 2 is droppable.** If the hydration reveal turns out to look fine without it, say so and skip it rather than adding complexity for its own sake. Task 1 stands alone.
- **If a visual detail reads badly on a device, adjust it** and say so in the commit — the transition duration and the bottom hairline are taste. The one-branch rule and the untouched desktop branch are not.
- **If the spec looks wrong rather than stale, stop and send the question to `thinker`.** Do not redesign in place.
