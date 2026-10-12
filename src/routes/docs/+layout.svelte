<script>
	import {pushState} from '$app/navigation'
	import {page} from '$app/state'
	import {base, resolve} from '$app/paths'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'

	let {data, children} = $props()

	const currentSlug = $derived(
		page.url.pathname.replace(base + '/docs/', '').replace(base + '/docs', '') || 'index'
	)

	const hasPlayground = $derived(/** @type {any} */ (page.data).playground === true)
	const hasHtml = $derived(!!data.html)

	const activeTab = $derived(
		page.state.tab ?? (page.url.hash === '#playground' ? 'playground' : 'docs')
	)

	function setTab(tab) {
		pushState(tab === 'docs' ? '' : '#playground', {tab})
	}
</script>

{#snippet topics()}
	<nav class="nav-vertical" aria-label="Docs">
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
			{#if data.subroutes?.[doc]}
				{#each data.subroutes[doc] as sub (sub)}
					<a
						class="subroute"
						href={resolve(`/docs/${doc}/${sub}`)}
						aria-current={currentSlug === `${doc}/${sub}` ? 'page' : undefined}>{sub}</a
					>
				{/each}
			{/if}
		{/each}
	</nav>
{/snippet}

<div class="docs">
	{@render topics()}

	<main class="article">
		<header>
			<!-- Mobile: the same menu, behind one button showing where you are. -->
			<PopoverMenu centered>
				{#snippet trigger()}
					<Icon icon="menu" />
					{currentSlug === 'index' ? 'Docs' : currentSlug}
				{/snippet}
				{@render topics()}
			</PopoverMenu>
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
			{/if}
		</header>

		{#if hasPlayground && hasHtml}
			<div class="doc-playground">
				<article class="doc-prose constrained article" class:hidden-tab={activeTab !== 'docs'}>
					<!-- eslint-disable svelte/no-at-html-tags -->
					{@html data.html}
				</article>
				<div class="doc-output article" class:hidden-tab={activeTab !== 'playground'}>
					{@render children()}
				</div>
			</div>
		{:else}
			<div class="constrained">
				{@render children()}
			</div>
		{/if}
	</main>
</div>

<style>
	.docs {
		display: grid;
		grid-template-columns: max-content 1fr;
		height: 100%;
	}

	/* Menu button (mobile) and Docs/Playground tabs share one sticky line. */
	header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		gap: var(--space-1);
		align-items: center;
		flex-wrap: wrap;

		> :global(*) {
			margin-block-end: 1rem;
		}

		> :global(.popover-menu) {
			display: none;
		}
	}

	:global([popover]) nav {
		max-height: 70dvh;
		overflow-y: auto;
	}

	nav {
		border-top: 0;
		border-left: 0;
		border-bottom: 0;

		a {
			padding: var(--space-1) 1rem var(--space-1) 1rem;
			font-size: var(--font-4);
			text-transform: capitalize;

			&[aria-current='page'] {
				background: var(--accent-7);
			}

			&.subroute {
				padding-inline-start: 2rem;
				font-size: var(--font-5);
			}
		}
	}

	.docs > main {
		padding: 1rem 0 0 1rem;
		min-width: 0;
	}

	.doc-playground {
		min-width: 0;
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
			display: none;
		}

		header > :global(.popover-menu) {
			display: block;
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
			border-right: 1px solid var(--color-interface-border);
		}
	}
</style>
