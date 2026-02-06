<script lang="ts">
	import {page} from '$app/state'
	import {goto, afterNavigate} from '$app/navigation'
	import {parseView, parseSearchQueryToView, serializeView, queryViewTracks, type View} from '$lib/views.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {Debounced} from 'runed'

	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.search)
	const viewQuery = queryViewTracks(() => view)

	// Form state (not $derived — avoids URL→form feedback loop)
	let channelsInput = $state('')
	let tagsInput = $state('')
	let tagsModeValue: 'any' | 'all' = $state('any')
	let orderValue: View['order'] = $state('created')
	let directionValue: 'asc' | 'desc' = $state('desc')
	let limitValue = $state('')
	let searchInput = $state('')
	let quickQuery = $state('')

	function syncForm(v: View) {
		channelsInput = v.channels?.join(', ') || ''
		tagsInput = v.tags?.join(', ') || ''
		tagsModeValue = v.tagsMode || 'any'
		orderValue = v.order || 'created'
		directionValue = v.direction || 'desc'
		limitValue = v.limit ? String(v.limit) : ''
		searchInput = v.search || ''
	}
	syncForm(parseView(page.url.searchParams))
	afterNavigate(({type}) => {
		if (type !== 'goto') syncForm(parseView(page.url.searchParams))
	})

	// Debounce expensive inputs (trigger fetches); sort/limit are instant
	const dChannels = new Debounced(() => channelsInput, 500)
	const dTags = new Debounced(() => tagsInput, 250)
	const dSearch = new Debounced(() => searchInput, 250)
	const splitList = (s: string) => [
		...new Set(
			s
				.split(',')
				.map((x) => x.trim())
				.filter(Boolean)
		)
	]

	const formView = $derived.by((): View => {
		const v: View = {}
		const ch = splitList(dChannels.current ?? '')
		if (ch.length) v.channels = ch
		const tg = splitList((dTags.current ?? '').replaceAll('#', ''))
		if (tg.length) v.tags = tg
		if (tagsModeValue === 'all') v.tagsMode = 'all'
		const search = (dSearch.current ?? '').trim()
		if (search) v.search = search
		v.order = orderValue
		v.direction = directionValue
		const n = Number(limitValue)
		v.limit = n > 0 ? n : 20
		return v
	})

	$effect(() => {
		goto(`/_debug/views?${serializeView(formView)}`, {replaceState: true})
	})
</script>

<svelte:head>
	<title>Views</title>
</svelte:head>

<article class="container">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>

	<header>
		<h1>Views</h1>
		<p>URL -> view -> query -> collection -> reactive.</p>
	</header>

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			syncForm(parseSearchQueryToView(quickQuery))
		}}
	>
		<fieldset>
			<label for="quick">Smart search</label>
			<div class="row">
				<input id="quick" type="text" bind:value={quickQuery} placeholder="@oskar @ko002 #jazz chill vibes" />
				<button type="submit">Go</button>
			</div>
		</fieldset>
		{#if quickQuery}
			<details>
				<summary>Parsed</summary>
				<pre>{JSON.stringify(parseSearchQueryToView(quickQuery), null, 2)}</pre>
			</details>
		{/if}
	</form>

	<hr />

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			goto(`/_debug/views?${serializeView(formView)}`, {replaceState: true})
		}}
	>
		<fieldset>
			<label for="channels">Channels (comma-separated slugs)</label>
			<input id="channels" type="text" bind:value={channelsInput} placeholder="tropicalia, oskar, ko002" />
		</fieldset>
		<fieldset>
			<legend>Tags (comma-separated)</legend>
			<fieldset class="row">
				<label class="visually-hidden" for="tags">Tags (comma-separated)</label>
				<select id="tagsMode" bind:value={tagsModeValue}>
					<option value="any">any</option>
					<option value="all">all</option>
				</select>
				<input id="tags" type="text" bind:value={tagsInput} placeholder="ambient, dub, jazz" />
				<label class="visually-hidden" for="tagsMode">Match</label>
			</fieldset>
		</fieldset>
		<fieldset>
			<label for="search">Search</label>
			<input id="search" type="text" bind:value={searchInput} placeholder="miles davis" />
		</fieldset>
		<fieldset class="row">
			<fieldset>
				<label>Sort</label>
				<SortControls bind:order={orderValue} bind:direction={directionValue} />
			</fieldset>
			<fieldset>
				<label for="limit">Limit</label>
				<input id="limit" type="number" bind:value={limitValue} placeholder="20" min="1" max="4000" />
			</fieldset>
			<fieldset class="end">
				<button type="button" onclick={() => syncForm({})}>Clear</button>
			</fieldset>
		</fieldset>
	</form>
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a search to start.</p>
	{:else if viewQuery.loading}
		<p>Loading tracks…</p>
	{:else if viewQuery.tracks.length}
		<p>{viewQuery.tracks.length} tracks</p>
	{/if}
</div>

{#if viewQuery.tracks.length}
	<Tracklist tracks={viewQuery.tracks} />
{/if}

<style>
	article {
		margin-block-end: 1rem;
	}
	header {
		margin-block: 0.5rem 1rem;
	}
	.row > input {
		flex: 1;
	}
	.end {
		align-self: flex-end;
	}
</style>
