# Modern minimalist redesign + GSAP motion — Design

Status: approved in the `thinker` session on 2026-09-23.
Next step: `planner` session writes
`docs/superpowers/plans/2026-09-23-minimalist-redesign-plan.md`.

## 1. Goal

Re-skin the existing OTP-simulation UI (built in
[2026-09-22-turnstile-otp-poc-design.md](2026-09-22-turnstile-otp-poc-design.md))
into a quiet, editorial-minimalist look, and add GSAP-driven micro-animation to
the form's validation and loading moments, without changing any client/server
behaviour, route, component prop, or test hook.

Success criteria:

- Visual: sidebar + case card + form + result panel read as one restrained,
  low-chrome system in both light and dark theme, at phone width and up.
- Motion: the four listed moments (§4) animate smoothly and consistently
  (shared durations/easing), and respect `prefers-reduced-motion`.
- The full existing Playwright suite (`tests/e2e/cases.spec.ts`) and `bun test`
  pass unmodified — no waits added, no `data-testid` moved or renamed.

Out of scope: any change to `src/lib/cases.ts`, `src/lib/server/*`, the API
route, the case matrix, or adding/removing simulation cases. This is a
presentation-layer pass only.

## 2. Visual direction — "quiet editorial minimalism"

Keep the current structure (sidebar case list + single-column main panel,
`CaseCard` → `OtpForm` → `ResultPanel`). Change its texture:

- **De-boxed cards**: replace `Card.Root`'s bordered/shadowed box on
  `CaseCard`, `OtpForm`'s wrapper, and `ResultPanel` with borderless sections
  separated by a single hairline divider (`border-border`, 1px, no shadow,
  no radius-driven card chrome). More vertical rhythm (`gap`/`py`) replaces
  the box as the separator between sections.
- **One accent color**: introduce a single desaturated accent, muted indigo,
  as a new `--accent-brand` token: `oklch(0.5 0.09 275)` in light mode,
  `oklch(0.75 0.09 275)` in dark mode (indigo hue ≈275°, low chroma to stay
  muted). Used only for: the active sidebar item, the submit button, and
  success state. Everything else stays the existing neutral oklch scale
  already in `app.css`. Destructive/error keeps the existing `--destructive`
  token. (Named `--accent-brand` rather than reusing shadcn's `--accent`
  token, which already means "neutral hover/highlight surface" throughout
  the generated primitives.)
- **Sidebar active state**: replace shadcn's filled-pill `isActive` background
  on `Sidebar.MenuButton` with a thin left accent bar + a font-weight bump on
  the label — reads like a table of contents, not a nav pill.
- **Typography**: lean on Inter Variable's weight axis (400/500/650) for
  hierarchy instead of introducing new size steps. Keep the existing
  monospace usage for technical output (`expectation`, error codes, JSON) —
  that contrast already works and should not change.
- **Both themes stay**: light and dark tokens both get retuned, same
  treatment in each; no theme is dropped or made default-only.

Files touched: `src/app.css` (token/accent additions), `src/routes/+layout.svelte`,
`src/lib/components/CaseCard.svelte`, `src/lib/components/OtpForm.svelte`,
`src/lib/components/ResultPanel.svelte`. No changes to
`src/lib/components/ui/**` primitives themselves — restyling happens via
Tailwind classes at the call sites, keeping the shadcn-svelte-generated
primitives unmodified and upgradeable.

## 3. Motion architecture

One new module, `src/lib/motion.ts`, built on plain `gsap` (core package
only — nothing on the animation list needs a plugin: fades, scale, x-shake,
and color tweens are all core `gsap.to`/`gsap.timeline`).

It exports:

- Two shared durations: `fast` (~0.2s, for input feedback) and `base`
  (~0.4s, for reveals).
- One shared ease: `power2.out`.
- A `prefersReducedMotion()` check (`window.matchMedia('(prefers-reduced-motion: reduce)')`),
  consulted by every exported function — when true, the function sets the
  end state immediately via `gsap.set` and returns, no tween.
- One small named function per moment in §4 (e.g. `shakeInvalid(el)`,
  `pulseRunning(el)`, `crossfadeSkeleton(from, to)`, `revealResult(el)`),
  each taking the element(s) it animates and returning a cleanup/kill
  handle where the animation is looping or interruptible (the button pulse,
  the skeleton cross-fade).

Components call these from Svelte 5 `$effect` blocks keyed on the relevant
reactive state (e.g. `running`, `result`, widget-loaded), and call the
returned kill handle in the effect's cleanup — the same
mount-tween/unmount-revert shape as GSAP's documented non-React lifecycle
pattern, adapted to `$effect` instead of `onMount`/`onDestroy`.

No new files beyond `src/lib/motion.ts`. No animation timeline/state lives
outside this module — components stay thin and declarative.

## 4. Animations per moment

- **Phone input validation** (`OtpForm.svelte`): on invalid submit, a quick
  horizontal shake (a few px, decaying) plus a border-color tween to the
  destructive token; on valid, a brief border-color settle to the accent.
  Purely a visual overlay — the input's value and native validity are
  unaffected in timing.
- **Submit button loading** (`OtpForm.svelte`): the label swaps to
  "Running…" and `disabled` flips **synchronously**, exactly as today, so
  the Playwright text/state assertions are untouched. GSAP separately
  animates a subtle low-amplitude pulse on the button's background/opacity
  while `running` is true, and `pulseRunning`'s kill handle is invoked the
  instant `running` flips back to `false`.
- **Turnstile load/verify** (`Turnstile.svelte` or a thin wrapper in
  `OtpForm.svelte`): a shadcn `Skeleton` (already in the repo) covers the
  widget container from mount; GSAP cross-fades the skeleton out the moment
  the widget's `render` callback fires and the container has content. The
  widget's own DOM node and `data-testid="turnstile-widget"` are present at
  the same instant as today — only the skeleton's entrance/exit opacity is
  animated.
- **Result panel reveal** (`ResultPanel.svelte`): when `result` flips from
  `null` to a value, the panel's content fades in and slides up ~8px; the
  JSON `<pre>` block starts its own fade a short beat (~0.1s) after the
  summary row, via the same timeline. Every `data-testid` node in the panel
  exists in the DOM at the same tick it does today — GSAP animates
  `opacity`/`transform` on already-mounted nodes, never their presence or
  the timing of a text/state change.

## 5. Testing & accessibility

- No Playwright test changes. Every existing assertion in
  `tests/e2e/cases.spec.ts` targets state (`data-testid`, text content,
  `disabled`) that flips synchronously in the component logic, unchanged by
  this redesign — GSAP only ever animates `opacity`/`transform`/`color` on
  nodes that are already present with their final state/text.
- `prefers-reduced-motion: reduce` short-circuits every function in
  `motion.ts` to the end state with no tween, satisfying the accessibility
  baseline without a separate code path per component.
- `bun test` is unaffected — `motion.ts` has no server-side or
  business-logic code and needs no unit test beyond a trivial manual check
  that `prefersReducedMotion()` gates each function (spot-checked during
  implementation, not a new test file).

## 6. Dependencies

Add `gsap` (core package, no plugins) as a runtime dependency in
`package.json`. No other new dependency — restyling stays inside the
existing shadcn-svelte primitives and Tailwind v4 tokens already in the
project.

## 7. Non-goals / explicit constraints for the implementer

- Do not touch `src/lib/cases.ts`, any file under `src/lib/server/`, or the
  API route — this spec is presentation-only.
- Do not restructure the sidebar/main-panel composition (a full layout
  restructure was considered and explicitly declined in favor of re-skinning
  in place).
- Do not add GSAP plugins (ScrollTrigger, Flip, SplitText, etc.) — nothing
  in §4 requires one, and adding one would be scope creep for a PoC.
- Do not change any `data-testid`, route, or prop shape on
  `CaseCard`/`OtpForm`/`ResultPanel`/`Turnstile`.
