<script lang="ts">
	import CaseCard from '$lib/components/CaseCard.svelte';
	import { page } from '$app/state';
	import { cases, findCase } from '$lib/cases';

	const simCase = $derived(findCase(page.url.searchParams.get('case') ?? '') ?? cases[0]);
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
	<CaseCard {simCase} />
</div>
