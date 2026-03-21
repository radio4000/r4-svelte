<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {queryView} from '$lib/views.svelte'
	import {parseView, serializeView, viewFromUrl, viewLabel, viewToUrl, type View} from '$lib/views'
	import {SearchUrl} from '$lib/search-url.svelte.js'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import SearchInput from '$lib/components/search-input.svelte'

	const uid = $props.id()
	const basePath = '/_debug/views'
	const search = new SearchUrl(basePath)

	const view: View = $derived(viewFromUrl(page.url))
	const primarySource = $derived(view.sources[0] ?? {})
	const hasFilter = $derived(
		!!primarySource.channels?.length || !!primarySource.tags?.length || !!primarySource.search
	)
	const hasExtraSources = $derived(view.sources.length > 1)
	const viewQuery = queryView(() => view)

	function onViewsBarChange(v: View) {
		search.seedInput(viewLabel(v))
		goto(viewToUrl(basePath, v), {replaceState: true})
	}

	// --- Pagination ---
	const DEFAULT_LIMIT = 50
	const offset = $derived(view.offset ?? 0)
	const limit = $derived(view.limit ?? DEFAULT_LIMIT)
	const hasNext = $derived(
		viewQuery.count
			? offset + viewQuery.tracks.length < viewQuery.count
			: viewQuery.tracks.length >= limit
	)

	function navigate(newOffset: number) {
		goto(viewToUrl(basePath, {...view, offset: newOffset, limit}), {replaceState: true})
	}

	// --- Examples ---
	const examples = [
		['Single channel', '@ko002'],
		['Channel + tags', '@oskar #jazz #dub'],
		['Search', 'miles davis'],
		['Shuffle + limit', '@ko002?order=shuffle&limit=50'],
		['Tags mode all', '#jazz #dub?tagsMode=all']
	] as const

	function loadExample(viewStr: string) {
		const v = parseView(viewStr)
		search.seedInput(viewLabel(v))
		goto(viewToUrl(basePath, v), {replaceState: true})
	}
</script>

<svelte:head>
	<title>Views debug</title>
</svelte:head>

<article>
	<menu class="nav-grouped">
		<a href="/_debug">&larr;</a>
	</menu>

	<header>
		<h1>Views</h1>
		<p>Track View debug. Reuses the same SearchUrl, ViewsBar, and queryView flow as the app.</p>
		{#if hasExtraSources}
			<p>
				<small
					>Multi-source Views parse and serialize here, but queryView currently uses the first
					source only.</small
				>
			</p>
		{/if}
	</header>

	<form onsubmit={search.handleSubmit}>
		<label for="{uid}-search" class="visually-hidden">View query</label>
		<SearchInput
			id="{uid}-search"
			bind:value={search.value}
			placeholder="@oskar @ko002 #jazz chill vibes"
			autofocus
		/>
	</form>

	<ViewsBar {view} onchange={onViewsBarChange} />

	<details>
		<summary>Examples</summary>
		<ul class="examples">
			{#each examples as [label, viewStr] (viewStr)}
				<li>
					<button class="ghost" onclick={() => loadExample(viewStr)}>{label}</button>
					<code>{viewStr}</code>
				</li>
			{/each}
		</ul>
	</details>

	<details open={hasFilter}>
		<summary>Representations</summary>
		<dl class="representations">
			<dt>Label</dt>
			<dd><code>{viewLabel(view) || '(empty)'}</code></dd>
			<dt>URI</dt>
			<dd><code>{serializeView(view) || '(empty)'}</code></dd>
			<dt>URL</dt>
			<dd><code>{viewToUrl(basePath, view)}</code></dd>
		</dl>
	</details>

	<details open={hasFilter}>
		<summary>Parsed view</summary>
		<pre>{JSON.stringify(view, null, 2)}</pre>
	</details>
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a search to start.</p>
	{:else}
		<div class="pagination">
			<button disabled={offset === 0} onclick={() => navigate(Math.max(0, offset - limit))}
				>← Prev</button
			>
			<button disabled={!hasNext} onclick={() => navigate(offset + limit)}>Next →</button>
			{#if viewQuery.loading}
				<span>Loading…</span>
			{:else}
				<span
					>{offset + 1}–{offset + viewQuery.tracks.length}{viewQuery.count
						? ` of ${viewQuery.count}`
						: ''}</span
				>
			{/if}
		</div>
		{#if !viewQuery.loading && !viewQuery.tracks.length}
			<p>No results.</p>
		{/if}
	{/if}
</div>

{#if viewQuery.tracks.length}
	<Tracklist tracks={viewQuery.tracks} />
{/if}

<style>
	article {
		padding: 0.5rem;
	}
	header {
		margin-block: 0.5rem 1rem;
	}
	form {
		margin-block-end: 0.5rem;
	}
	.examples {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.examples li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.examples code {
		font-size: 0.85em;
		opacity: 0.7;
	}
	.pagination {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	details {
		margin-block: 0.5rem;
	}
	pre {
		font-size: 0.8em;
		overflow-x: auto;
	}
	.representations {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 0.5rem;
	}
	.representations dt {
		font-weight: 600;
	}
	.representations dd {
		margin: 0;
		min-width: 0;
	}
	.representations code {
		overflow-wrap: anywhere;
	}
</style>
