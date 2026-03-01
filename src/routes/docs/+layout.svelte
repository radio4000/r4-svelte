<script>
	import {page} from '$app/state'

	let {data, children} = $props()

	const currentSlug = $derived(page.url.pathname.replace('/docs/', '').replace('/docs', '') || 'index')
</script>

<div class="docs-layout">
	<nav class="docs-sidebar">
		<a href="/docs" aria-current={currentSlug === 'index' ? 'page' : undefined}>Docs</a>
		<a href="/docs/reference" aria-current={currentSlug === 'reference' ? 'page' : undefined}>Reference</a>
		<hr />
		{#each data.docs.filter((d) => d !== 'index' && d !== 'reference') as doc (doc)}
			<a href="/docs/{doc}" aria-current={currentSlug === doc ? 'page' : undefined}>{doc}</a>
		{/each}
	</nav>

	<main class="docs-content">
		<div class="constrained">
			{@render children()}
		</div>
	</main>
</div>

<style>
	.docs-layout {
		display: grid;
		grid-template-columns: max-content 1fr;
		height: 100%;
	}

	.docs-sidebar {
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--gray-4);
		overflow-y: auto;
		max-height: 100dvh;
		position: sticky;
		top: 0;
		padding-block-start: 0.5rem;

		a {
			display: block;
			padding: 0rem 0.5rem;
			font-size: var(--font-3);

			&[aria-current='page'] {
				background: var(--accent-4);
			}
		}
	}

	.docs-content {
		overflow-y: auto;
		max-height: 100dvh;
		padding: 1rem;
	}

	@media (max-width: 640px) {
		.docs-layout {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}

		.docs-sidebar {
			flex-direction: row;
			flex-wrap: wrap;
			overflow-x: auto;
			overflow-y: hidden;
			max-height: unset;
			position: static;
			border-right: none;
			border-bottom: 1px solid var(--gray-4);
		}
	}
</style>
