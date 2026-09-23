<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Turnstile from './Turnstile.svelte';
	import type { RunResult } from './ResultPanel.svelte';
	import { DEFAULT_PHONE, type SimCase } from '$lib/cases';
	import { pulseRunning, settleValid, shakeInvalid } from '$lib/motion';

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

	/** Element refs, for GSAP only. Never used to read or write form state. */
	let inputEl = $state<HTMLInputElement | null>(null);
	let submitEl = $state<HTMLElement | null>(null);

	/**
	 * Feedback for the phone field, decided by the server's status code.
	 * There is deliberately no client-side validation: the `invalid-phone` case
	 * asserts a 422 from the API, which means the request must actually be sent.
	 */
	let feedback = $state<'idle' | 'invalid' | 'valid'>('idle');

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
		feedback = 'idle';
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

			const status = last?.status ?? null;
			feedback = status === 422 ? 'invalid' : status === 200 ? 'valid' : 'idle';

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
</script>

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
