# Sidebar: inline expandable on mobile, not an overlay — Design

Status: approved in the `thinker` session on 2026-09-23.
Next step: `planner` session writes
`docs/superpowers/plans/2026-09-23-sidebar-expandable-plan.md`.

Sequencing: this work starts **after** Task 7 of
`docs/superpowers/plans/2026-09-23-minimalist-redesign-plan.md` lands
(verified + deployed). Tasks 3–7 of that plan never touch
`src/routes/+layout.svelte` or `src/lib/components/ui/sidebar/**` again — only
its Task 2 did, already committed (`9b066e9`) — so there is no file-level
conflict, but running one plan to completion before starting a second on
related files keeps the redesign's own acceptance check (Task 7) meaningful
and avoids `executor` context-switching mid-plan.

## 1. Goal

On mobile/narrow viewports (`<768px`, the existing `IsMobile` breakpoint), the
sidebar currently renders as a `Sheet` — a modal overlay with a backdrop,
hidden until the hamburger `Sidebar.Trigger` opens it (`openMobile` defaults
to `false`). Replace that with an inline panel, expanded by default, that the
user can still collapse — never a modal.

Desktop (`≥768px`) is unaffected: it is already inline and expanded by
default (`open` defaults to `true` in `SidebarState`).

Success criteria:

- At `<768px`, on first load, the full case list is visible inline, stacked
  above the main content — no tap required to see the options.
- The same `Sidebar.Trigger` still collapses/expands it; collapsing does not
  cover the page with a backdrop, it just shrinks the panel.
- Desktop layout, sidebar styling (from the minimalist redesign), and every
  `data-testid`/`data-case` hook are unchanged.
- `bun run test:e2e` passes unmodified — it runs at the default desktop
  viewport and touches none of this.

Out of scope: any change to sidebar visual styling (already done by the
redesign plan), to `+layout.svelte`'s markup, to `cases.ts`, or to any test
file. This is a single-primitive behavior change.

## 2. Approach

Two options were considered:

1. **Edit the sidebar primitive's mobile branch (chosen).** In
   `src/lib/components/ui/sidebar/sidebar.svelte`, the `{:else if
   sidebar.isMobile}` branch currently renders `Sheet.Root` / `Sheet.Content`.
   Replace it with an inline container using a CSS `max-height` (or grid-rows)
   transition for expand/collapse — no GSAP, no JS animation library; this is
   a plain state-driven CSS transition. Flip `openMobile`'s default in
   `src/lib/components/ui/sidebar/context.svelte.ts` from `false` to `true`.
   `+layout.svelte` needs no changes — it already just renders `Sidebar.Root`
   + `Sidebar.Trigger` and lets the primitive decide how mobile looks.

2. **Leave the primitive alone; add a separate mobile-only case list in
   `+layout.svelte`** (e.g. a native `<details>`), shown `<md`, with
   `Sidebar.Root` restricted to `≥md`. Safer against a future
   `shadcn-svelte` regeneration of this component, but duplicates the
   group/menu rendering (loop over `groups`, active state, manual badge) in
   two places for what is currently this app's only `Sidebar` consumer.

**Chosen: option 1.** `Sidebar.Root` has exactly one consumer
(`+layout.svelte`) in this app, so there is no duplication risk from editing
the primitive directly, and it is already hand-edited/vendored code (the
redesign plan's Task 2 already changed call-site classes against it; this
project has no plan to re-run the shadcn-svelte generator over it). One
change point beats duplicating the render logic.

## 3. Behavior detail

- `SidebarState.openMobile` (`context.svelte.ts`) defaults to `true` instead
  of `false`. `toggle()`, `setOpenMobile()`, and the `Cmd/Ctrl+B` shortcut
  keep working exactly as today — they just start from the opposite default.
- In `sidebar.svelte`'s mobile branch, replace the `Sheet.Root`/`Sheet.Content`
  markup with a plain container that:
  - Renders inline in document flow (not `fixed`, not portaled) — it pushes
    the main content down when expanded, the way a normal block element does.
  - Transitions a bounded dimension (`max-height` or CSS grid
    `grid-template-rows: 0fr → 1fr`) driven by `sidebar.openMobile`, so
    collapse/expand animates without JavaScript.
  - Keeps `data-slot="sidebar"` and `data-mobile="true"` for consistency with
    the existing data attributes elsewhere in the file.
  - Has no backdrop, no focus trap, no scroll-lock — those are Sheet/dialog
    behaviors that only make sense for a modal, and this is no longer one.
- `Sidebar.Trigger` (already `class="mb-6 md:hidden"` at the call site) keeps
  its current job: toggle visibility. Its label/icon may need a rename in a
  future pass (e.g. from "open menu" to "collapse/expand") but that is a
  copy-only concern, not part of this spec.
- Desktop's branch (the `else` case in `sidebar.svelte`, `data-slot="sidebar"`
  with the `sidebar-gap`/`sidebar-container` structure) is untouched.

## 4. Testing

No existing Playwright test touches mobile viewport, the `Sheet`, or
`Sidebar.Trigger` — confirmed by grep against `tests/e2e/cases.spec.ts` and
`playwright.config.ts`. The suite runs at Playwright's default desktop
viewport, where this change is a no-op, so `bun run test:e2e` needs no
changes and should stay fully green.

Verification is manual, via DevTools device emulation at `<768px`:

- confirm the sidebar is visible and expanded on first load, no backdrop
- confirm `Sidebar.Trigger` collapses it (panel shrinks, page content is
  never covered) and expands it again
- confirm the collapse/expand transition is smooth (no layout jump, no
  flash of full-height then snap)
- confirm desktop (`≥768px`) is pixel-identical to before this change
- confirm both light and dark theme still look correct in the mobile panel

This matches how this project already treats non-automatable verification
(the `interactive` and `real-keys` cases) — no new Playwright project or
viewport config is added for a PoC-sized behavior check.

## 5. Non-goals / explicit constraints for the implementer

- Do not change any sidebar visual styling introduced by the minimalist
  redesign (the accent rail, spacing, typography) — this spec is behavior
  (overlay → inline) only.
- Do not touch `+layout.svelte`, `src/lib/cases.ts`, or any test file.
- Do not add a new dependency — the expand/collapse transition is plain CSS.
- Do not start this work before
  `docs/superpowers/plans/2026-09-23-minimalist-redesign-plan.md`'s Task 7
  has landed (verified and deployed).
