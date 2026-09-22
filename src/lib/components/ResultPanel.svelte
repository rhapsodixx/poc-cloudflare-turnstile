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
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { SimCase } from '$lib/cases';

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
</script>

<Card.Root data-testid="result-panel">
	<Card.Header>
		<Card.Title>Result</Card.Title>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if !result}
			<p class="text-sm text-muted-foreground">Submit the form to run this case.</p>
		{:else if result.widgetError}
			<div class="flex items-center gap-2">
				<Badge variant="destructive">widget blocked</Badge>
				<span data-testid="widget-error" class="font-mono text-sm">{result.widgetError}</span>
			</div>
			<p class="text-sm text-muted-foreground">No request was sent to the server.</p>
		{:else}
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant={result.status === 200 ? 'default' : 'destructive'} data-testid="result-status">
					{result.status}
				</Badge>
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

			<pre class="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(result.body, null, 2)}</pre>
		{/if}

		{#if simCase.group === 'Rate limit'}
			<div class="flex items-center gap-3 border-t pt-3">
				{#if quota}
					<span class="text-xs text-muted-foreground">
						remaining — phone {quota.phone.remaining}/{quota.phone.limit}, ip {quota.ip.remaining}/{quota.ip
							.limit}
					</span>
				{/if}
				<Button size="sm" variant="outline" disabled={resetting} onclick={resetQuota}>
					Reset this case's quota
				</Button>
				{#if resetMessage}<span class="text-xs text-muted-foreground">{resetMessage}</span>{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
