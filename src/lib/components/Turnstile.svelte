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
