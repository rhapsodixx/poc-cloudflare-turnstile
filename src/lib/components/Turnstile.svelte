<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { crossfadeSkeleton } from '$lib/motion';

	interface Props {
		sitekey: string;
		token?: string;
		onerror?: (code: string) => void;
	}

	let { sitekey, token = $bindable(''), onerror }: Props = $props();

	let container: HTMLDivElement;
	let widgetId: string | undefined;
	/** Flips once the widget has been handed to Turnstile, or has failed. */
	let loaded = $state(false);
	/** Wrapper around the Skeleton — GSAP fades this, so the Skeleton's own
	 *  `animate-pulse` CSS animation is left free to keep shimmering underneath.
	 *  (A CSS animation outranks an inline style, so animating the Skeleton
	 *  itself would have GSAP and `animate-pulse` fighting over `opacity`.) */
	let skeletonEl = $state<HTMLDivElement | null>(null);

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

		return () => {
			cancelled = true;
			if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
			widgetId = undefined;
		};
	});

	$effect(() => {
		if (!loaded) return;
		return crossfadeSkeleton(skeletonEl);
	});

	/** Clears the solved token so the next submit gets a fresh one. */
	export function reset() {
		if (widgetId && window.turnstile) {
			token = '';
			window.turnstile.reset(widgetId);
		}
	}
</script>

<div class="relative min-h-[65px]">
	<div bind:this={container} data-testid="turnstile-widget"></div>
	<div bind:this={skeletonEl} class="pointer-events-none absolute inset-0">
		<Skeleton class="h-full w-full rounded-md" />
	</div>
</div>
