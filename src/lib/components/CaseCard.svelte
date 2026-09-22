<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { SimCase } from '$lib/cases';

	let { simCase }: { simCase: SimCase } = $props();

	const expectation = $derived(
		simCase.expected.widgetError
			? 'widget blocks the request'
			: `HTTP ${simCase.expected.status}${simCase.expected.errorCode ? ` · ${simCase.expected.errorCode}` : ''}`
	);
</script>

<section data-testid="case-card" class="flex flex-col gap-3">
	<div class="flex flex-col gap-1.5">
		<h2 class="text-lg font-[650] tracking-tight">{simCase.title}</h2>
		<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
			{simCase.description}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
		<span class="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
			Expected
		</span>
		<span data-testid="case-expectation" class="font-mono text-sm">{expectation}</span>
		{#if simCase.manual}
			<Badge variant="outline" class="border-border/60 text-[0.65rem] font-normal text-muted-foreground">
				manual
			</Badge>
		{/if}
		{#if simCase.repeat}
			<Badge variant="outline" class="border-border/60 text-[0.65rem] font-normal text-muted-foreground">
				×{simCase.repeat}
			</Badge>
		{/if}
	</div>
</section>
