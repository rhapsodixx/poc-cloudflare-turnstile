<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { useSidebar } from "./context.svelte.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		side = "left",
		variant = "sidebar",
		collapsible = "offcanvas",
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: "left" | "right";
		variant?: "sidebar" | "floating" | "inset";
		collapsible?: "offcanvas" | "icon" | "none";
	} = $props();

	const sidebar = useSidebar();

	/**
	 * The media query is false on the server, so the mobile branch only mounts at
	 * hydration — already expanded, which snaps the page down in one frame.
	 * Holding it collapsed for a single frame lets the grid transition from
	 * Task 1 run, turning that snap into a deliberate reveal.
	 */
	let entered = $state(false);

	$effect(() => {
		const frame = requestAnimationFrame(() => (entered = true));
		return () => cancelAnimationFrame(frame);
	});
</script>

{#if collapsible === "none"}
	<div
		class={cn(
			"flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else if sidebar.isMobile}
	<!--
		Inline, not a modal. Below `md` this panel sits in normal document flow
		above the main content and expands/collapses by transitioning the grid
		row between 0fr and 1fr — which animates to the content's exact height
		with no magic max-height number, and needs no JS.
		No backdrop, no focus trap, no scroll lock: those are dialog behaviours
		and this is not a dialog any more.
	-->
	<div
		bind:this={ref}
		data-sidebar="sidebar"
		data-slot="sidebar"
		data-mobile="true"
		data-state={sidebar.openMobile ? "expanded" : "collapsed"}
		class={cn(
			"grid w-full bg-sidebar text-sidebar-foreground transition-[grid-template-rows] duration-200 ease-linear",
			sidebar.openMobile && entered ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
			className,
			// After `className` on purpose: the call site sets `border-r` for the
			// desktop column, which reads as a stray vertical rule once the panel
			// is stacked. Same hairline, correct edge.
			"border-r-0 border-b"
		)}
		{...restProps}
	>
		<div class="flex min-h-0 w-full flex-col overflow-hidden">
			{@render children?.()}
		</div>
	</div>
{:else}
	<div
		bind:this={ref}
		class="group peer hidden text-sidebar-foreground md:block"
		data-state={sidebar.state}
		data-collapsible={sidebar.state === "collapsed" ? collapsible : ""}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		<!-- This is what handles the sidebar gap on desktop -->
		<div
			data-slot="sidebar-gap"
			class={cn(
				"transition-[width] duration-200 ease-linear relative w-(--sidebar-width) bg-transparent",
				"group-data-[collapsible=offcanvas]:w-0",
				"group-data-[side=right]:rotate-180",
				variant === "floating" || variant === "inset"
					? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_(--spacing(4)))]"
					: "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
			)}
		></div>
		<div
			data-slot="sidebar-container"
			data-side={side}
			class={cn(
				"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:start-0 data-[side=left]:group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)_*_-1)] data-[side=right]:end-0 data-[side=right]:group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)_*_-1)] md:flex",
				// Adjust the padding for floating and inset variants.
				variant === "floating" || variant === "inset"
					? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_(--spacing(4))_+_2px)]"
					: "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s",
				className
			)}
			{...restProps}
		>
			<div
				data-sidebar="sidebar"
				data-slot="sidebar-inner"
				class="bg-sidebar group-data-[variant=floating]:ring-sidebar-border group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 flex size-full flex-col"
			>
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
