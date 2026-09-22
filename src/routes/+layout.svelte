<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { page } from '$app/state';
	import { cases, groupedCases } from '$lib/cases';

	let { children } = $props();

	const activeId = $derived(page.url.searchParams.get('case') ?? cases[0].id);
	const groups = groupedCases();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<Sidebar.Provider>
	<Sidebar.Root>
		<Sidebar.Header class="px-4 py-3">
			<h1 class="text-sm font-semibold">Turnstile OTP simulations</h1>
			<p class="text-xs text-muted-foreground">
				Cloudflare Turnstile · phone validation · rate limits
			</p>
		</Sidebar.Header>
		<Sidebar.Content>
			{#each groups as group (group.group)}
				<Sidebar.Group>
					<Sidebar.GroupLabel>{group.group}</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={item.id === activeId}>
										{#snippet child({ props })}
											<a href="/?case={item.id}" data-case={item.id} {...props}>
												<span>{item.title}</span>
												{#if item.manual}
													<Badge variant="outline" class="ml-auto">manual</Badge>
												{/if}
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</Sidebar.Content>
	</Sidebar.Root>

	<main class="flex-1 p-6">
		<Sidebar.Trigger class="mb-4 md:hidden" />
		{@render children?.()}
	</main>
</Sidebar.Provider>
