<script lang="ts">
	import CaseCard from '$lib/components/CaseCard.svelte';
	import OtpForm from '$lib/components/OtpForm.svelte';
	import ResultPanel, { type RunResult } from '$lib/components/ResultPanel.svelte';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import { cases, findCase } from '$lib/cases';

	const simCase = $derived(findCase(page.url.searchParams.get('case') ?? '') ?? cases[0]);
	const sitekey = $derived(
		simCase.sitekey === 'ENV' ? (env.PUBLIC_TURNSTILE_SITEKEY ?? '') : simCase.sitekey
	);

	let result = $state<RunResult | null>(null);

	// A result belongs to the case that produced it.
	$effect(() => {
		simCase.id;
		result = null;
	});
</script>

<div class="mx-auto flex max-w-2xl flex-col divide-y divide-border">
	<div class="pb-8">
		<CaseCard {simCase} />
	</div>
	<div class="py-8">
		{#key simCase.id}
			<OtpForm {simCase} {sitekey} onresult={(r) => (result = r)} />
		{/key}
	</div>
	<div class="pt-8">
		<ResultPanel {simCase} {result} />
	</div>
</div>
