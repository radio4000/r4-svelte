<script>
	import {pushState} from '$app/navigation'
	import {page} from '$app/state'
	import {base, resolve} from '$app/paths'

	let {data, children} = $props()

	const currentSlug = $derived(
		page.url.pathname.replace(base + '/docs/', '').replace(base + '/docs', '') || 'index'
	)

	const hasPlayground = $derived(/** @type {any} */ (data).playground === true)
	const hasHtml = $derived(!!data.html)

	const activeTab = $derived(
		page.state.tab ?? (page.url.hash === '#playground' ? 'playground' : 'docs')
	)

	function setTab(tab) {
		pushState(tab === 'docs' ? '' : '#playground', {tab})
	}
</script>

<div class="docs">
	<nav class="nav-vertical">
		<a href={resolve('/docs')} aria-current={currentSlug === 'index' ? 'page' : undefined}>Docs</a>
		<a
			href={resolve('/docs/reference')}
			aria-current={currentSlug === 'reference' ? 'page' : undefined}>Reference</a
		>
		<hr />
		{#each data.docs.filter((d) => d !== 'index' && d !== 'reference') as doc (doc)}
			<a href={resolve(`/docs/${doc}`)} aria-current={currentSlug === doc ? 'page' : undefined}
				>{doc}</a
			>
		{/each}
	</nav>

	<main class="article">
		<div class="constrained">
			{#if hasPlayground && hasHtml}
				<menu class="tabs nav-grouped doc-tabs">
					<button
						aria-current={activeTab === 'docs' ? 'true' : undefined}
						onclick={() => setTab('docs')}>Docs</button
					>
					<button
						aria-current={activeTab === 'playground' ? 'true' : undefined}
						onclick={() => setTab('playground')}>Playground</button
					>
				</menu>

				<div class="doc-playground">
					<article class="doc-prose article" class:hidden-tab={activeTab !== 'docs'}>
						<!-- eslint-disable svelte/no-at-html-tags -->
						{@html data.html}
					</article>
					<div class="doc-output article" class:hidden-tab={activeTab !== 'playground'}>
						{@render children()}
					</div>
				</div>
			{:else}
				{@render children()}
			{/if}
		</div>
	</main>
</div>

<style>
	.docs {
		display: grid;
		grid-template-columns: max-content 1fr;
		height: 100%;
	}

	.docs > nav {
		border-top: 0;
		border-left: 0;
		border-bottom: 0;

		a {
			padding: 0.25rem 1rem 0.2rem 1rem;
			font-size: var(--font-4);
			text-transform: capitalize;

			&[aria-current='page'] {
				background: var(--accent-7);
			}
		}
	}

	.docs > main {
		padding: 1rem 0 0 1rem;
	}

	.doc-tabs {
		position: sticky;
		top: 0;
		z-index: 1;
		margin-block-end: 1rem;
	}

	.doc-playground {
		display: grid;
		gap: 1rem;
	}

	.hidden-tab {
		display: none;
	}

	@media (max-width: 640px) {
		.docs {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}

		.docs > nav {
			flex-direction: row;
			flex-wrap: wrap;
			overflow-x: auto;
			overflow-y: hidden;
			position: static;
			border-right: none;
			border-bottom: 1px solid var(--gray-4);
		}
	}

	@media (min-width: 1280px) {
		.doc-tabs {
			display: none;
		}

		.hidden-tab {
			display: block;
		}

		.doc-playground {
			grid-template-columns: 1fr 1fr;
		}

		.doc-prose {
			padding-inline-end: 1rem;
			border-right: 1px solid var(--gray-4);
		}
	}
</style>
