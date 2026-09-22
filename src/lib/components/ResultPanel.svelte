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
	import { Button } from '$lib/components/ui/button/index.js';
	import type { SimCase } from '$lib/cases';
	import { revealResult } from '$lib/motion';

	let { simCase, result }: { simCase: SimCase; result: RunResult | null } = $props();

	const body = $derived(result?.body as Record<string, unknown> | undefined);
	const errorCodes = $derived((body?.detail as string[] | undefined) ?? []);
	const quota = $derived(
		body?.quota as
			| { phone: { remaining: number; limit: number }; ip: { remaining: number; limit: number } }
			| undefined
	);

	let resetting = $state(false);
	let resetMessage = $state('');

	/** Root element, so `revealResult` can find its `data-motion` targets. */
	let rootEl = $state<HTMLElement | null>(null);

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

	// Reveal whenever a result arrives. `result` is reset to null on every case
	// change (see src/routes/+page.svelte), so this re-fires per run.
	$effect(() => {
		if (!result) return;
		return revealResult(rootEl);
	});
</script>

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
