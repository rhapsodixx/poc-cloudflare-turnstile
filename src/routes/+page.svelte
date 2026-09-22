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

<div class="mx-auto flex max-w-2xl flex-col gap-6">
	<CaseCard {simCase} />
	{#key simCase.id}
		<OtpForm {simCase} {sitekey} onresult={(r) => (result = r)} />
	{/key}
	<ResultPanel {simCase} {result} />
</div>
