<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { SimCase } from '$lib/cases';

	let { simCase }: { simCase: SimCase } = $props();

	const expectation = $derived(
		simCase.expected.widgetError
			? 'widget blocks the request'
			: `HTTP ${simCase.expected.status}${simCase.expected.errorCode ? ` · ${simCase.expected.errorCode}` : ''}`
	);
</script>

<Card.Root data-testid="case-card">
	<Card.Header>
		<Card.Title>{simCase.title}</Card.Title>
		<Card.Description>{simCase.description}</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-2">
		<Badge variant="secondary">Expected</Badge>
		<span data-testid="case-expectation" class="text-sm font-mono">{expectation}</span>
		{#if simCase.manual}
			<Badge variant="outline">manual</Badge>
		{/if}
		{#if simCase.repeat}
			<Badge variant="outline">×{simCase.repeat}</Badge>
		{/if}
	</Card.Content>
</Card.Root>
