<script>
	import PageHeader from './page-header.svelte'
	import ExploreSectionMenu from './explore-section-menu.svelte'

	const {children, filterChips} = $props()
</script>

<PageHeader wrap>
	<div class="explore-top-row">
		{@render children?.()}
	</div>
	<nav class="explore-nav-row">
		<ExploreSectionMenu />
		{#if filterChips}
			<div class="explore-filter-chips">
				{@render filterChips()}
			</div>
		{/if}
	</nav>
</PageHeader>

<style>
	.explore-top-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-width: 0;
	}

	.explore-top-row :global(.search-input) {
		flex: 1 1 0;
		min-width: 4rem;
	}

	.explore-nav-row {
		display: flex;
		align-items: center;
		width: 100%;
		gap: 0.75rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.explore-filter-chips {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		padding-left: 0.25rem;
		border-left: 1px solid var(--gray-5);
	}

	@media (max-width: 768px) {
		.explore-nav-row {
			flex-wrap: wrap;
			overflow-x: visible;
		}

		.explore-filter-chips {
			flex-basis: 100%;
			border-left: none;
			padding-left: 0;
			border-top: 1px solid var(--gray-5);
			padding-top: 0.4rem;
			overflow-x: auto;
			scrollbar-width: none;
		}
	}

	.explore-filter-chips :global(.btn.chip) {
		flex: 0 0 auto;
	}
</style>
