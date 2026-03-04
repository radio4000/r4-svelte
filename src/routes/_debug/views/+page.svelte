<script lang="ts">
	import {page} from '$app/state'
	import {goto, afterNavigate} from '$app/navigation'
	import {queryView} from '$lib/views.svelte'
	import {parseView, viewFromUrl, viewLabel, type View} from '$lib/views'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ViewsBar from '$lib/components/views-bar.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {Debounced} from 'runed'

	const uid = $props.id()

	// --- Smart input (local, ephemeral) ---
	let inputValue = $state('')
	const debouncedInput = new Debounced(() => inputValue, 300)

	// --- URL is the single source of truth ---
	const view: View = $derived(viewFromUrl(page.url))
	const hasFilter = $derived(view.sources.some((s) => !!s.channels?.length || !!s.tags?.length || !!s.search))
	const viewQuery = queryView(() => view)

	// --- Sync input from URL on landing + browser back/forward ---
	let inputSeeded = false
	afterNavigate(({type}) => {
		if (type === 'goto') return
		const seeded = page.url.searchParams.get('q') ?? ''
		inputValue = seeded
		inputSeeded = !!seeded
	})

	// --- View → URL params ---
	function viewToUrl(v: View): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const params = new URLSearchParams()
		const q = viewLabel(v)
		if (q) params.set('q', q)
		if (v.order) params.set('order', v.order)
		if (v.direction) params.set('direction', v.direction)
		if (v.limit) params.set('limit', String(v.limit))
		if (v.offset) params.set('offset', String(v.offset))
		const str = params.toString()
		return str ? `/_debug/views?${str}` : '/_debug/views'
	}

	// --- Smart input → URL ---
	$effect(() => {
		const q = debouncedInput.current.trim()
		if (!q) return
		if (inputSeeded) {
			inputSeeded = false
			return
		}
		const resolved = parseView(q)
		goto(viewToUrl(resolved), {replaceState: true})
	})

	function handleSubmit(e: Event) {
		e.preventDefault()
		const q = inputValue.trim()
		if (!q) {
			goto('/_debug/views', {replaceState: true})
			return
		}
		debouncedInput.setImmediately(inputValue)
	}

	// --- ViewsBar → URL ---
	function onViewsBarChange(v: View) {
		inputSeeded = true
		inputValue = viewLabel(v)
		goto(viewToUrl(v), {replaceState: true})
	}

	// --- Pagination ---
	const DEFAULT_LIMIT = 50
	const offset = $derived(view.offset ?? 0)
	const limit = $derived(view.limit ?? DEFAULT_LIMIT)
	const hasNext = $derived(
		viewQuery.count ? offset + viewQuery.tracks.length < viewQuery.count : viewQuery.tracks.length >= limit
	)

	function navigate(newOffset: number) {
		goto(viewToUrl({...view, offset: newOffset, limit}), {replaceState: true})
	}

	// --- Examples ---
	const examples = [
		['Single channel', '@ko002'],
		['Channel + tags', '@oskar #jazz #dub'],
		['Search', 'miles davis'],
		['Shuffle + limit', '@ko002?order=shuffle&limit=50'],
		['Tags mode all', '#jazz #dub?tagsMode=all'],
		['Multi-query', '@ko002 #jazz;@oskar #dub'],
		['Multi + options', '@ko002 #jazz;@oskar #dub?order=created&direction=asc&limit=100']
	] as const

	function loadExample(viewStr: string) {
		const v = parseView(viewStr)
		inputSeeded = true
		inputValue = viewLabel(v)
		goto(viewToUrl(v), {replaceState: true})
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
		<p>Smart input + ViewsBar + queryView. URL is source of truth.</p>
	</header>

	<form onsubmit={handleSubmit}>
		<label for="{uid}-search" class="visually-hidden">View query</label>
		<SearchInput id="{uid}-search" bind:value={inputValue} placeholder="@oskar @ko002 #jazz chill vibes" autofocus />
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
		<summary>Parsed view</summary>
		<pre>{JSON.stringify(view, null, 2)}</pre>
	</details>
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a search to start.</p>
	{:else}
		<div class="pagination">
			<button disabled={offset === 0} onclick={() => navigate(Math.max(0, offset - limit))}>← Prev</button>
			<button disabled={!hasNext} onclick={() => navigate(offset + limit)}>Next →</button>
			{#if viewQuery.loading}
				<span>Loading…</span>
			{:else}
				<span>{offset + 1}–{offset + viewQuery.tracks.length}{viewQuery.count ? ` of ${viewQuery.count}` : ''}</span>
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
</style>
