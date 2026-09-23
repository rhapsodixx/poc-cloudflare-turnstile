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
	<Sidebar.Root class="border-r">
		<Sidebar.Header class="px-5 py-5">
			<h1 class="text-sm font-[650] tracking-tight">Turnstile OTP simulations</h1>
			<p class="text-xs text-muted-foreground">
				Cloudflare Turnstile · phone validation · rate limits
			</p>
		</Sidebar.Header>
		<Sidebar.Content class="px-2">
			{#each groups as group (group.group)}
				<Sidebar.Group>
					<Sidebar.GroupLabel
						class="px-3 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase"
					>
						{group.group}
					</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.id)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										isActive={item.id === activeId}
										class="relative h-auto rounded-none py-1.5 pl-4 font-normal text-muted-foreground transition-colors before:absolute before:top-1 before:bottom-1 before:left-0 before:w-px before:bg-transparent hover:bg-transparent hover:text-foreground data-active:bg-transparent data-active:font-medium data-active:text-foreground data-active:before:w-[2px] data-active:before:bg-accent-brand"
									>
										{#snippet child({ props })}
											<a href="/?case={item.id}" data-case={item.id} {...props}>
												<span>{item.title}</span>
												{#if item.manual}
													<Badge
														variant="outline"
														class="ml-auto border-border/60 text-[0.65rem] font-normal text-muted-foreground"
													>
														manual
													</Badge>
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

	<main class="min-w-0 flex-1 px-6 py-10 md:px-10">
		<Sidebar.Trigger class="mb-6 md:hidden" />
		{@render children?.()}
	</main>
</Sidebar.Provider>
