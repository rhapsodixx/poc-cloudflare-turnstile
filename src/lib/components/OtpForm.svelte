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

	// Writable derived (Svelte 5.25+): re-prefills whenever the case changes,
	// but the user can still type into it, same as $state + a reset $effect.
	let phone = $derived(simCase.phone ?? DEFAULT_PHONE);
	let token = $state('');
	let widget: Turnstile;
	let running = $state(false);
	/** Set when the widget's error-callback fires; there will never be a token. */
	let widgetFailed = $state(false);

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
		if (widgetFailed) return;
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

<form class="flex flex-col gap-4" method="dialog" onsubmit={submit}>
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
