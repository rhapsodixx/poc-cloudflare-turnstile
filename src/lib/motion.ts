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
