<script>
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {parseView, serializeView} from '$lib/views'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {tracksCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import {inArray} from '@tanstack/db'

	// The view — single derived from URL, the source of truth
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length)

	// Form inputs (mutable, synced from URL on load)
	let channelsInput = $state(page.url.searchParams.get('channels') || '')
	let tagsInput = $state(page.url.searchParams.get('tags') || '')
	let tagsModeValue = $state(page.url.searchParams.get('tagsMode') || 'any')
	let sortValue = $state(page.url.searchParams.get('sort') || '')
	let limitValue = $state(page.url.searchParams.get('limit') || '')

	function applyView() {
		/** @type {import('$lib/views').View} */
		const v = {}
		const ch = channelsInput
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
		if (ch.length) v.channels = ch
		const tg = tagsInput
			.split(',')
			.map((s) => s.trim().replace(/^#/, ''))
			.filter(Boolean)
		if (tg.length) v.tags = tg
		if (tagsModeValue === 'all') v.tagsMode = 'all'
		if (sortValue === 'newest' || sortValue === 'oldest') v.sort = sortValue
		const n = Number(limitValue)
		if (n > 0) v.limit = n
		goto(`/_debug/views?${serializeView(v)}`, {replaceState: true})
	}

	function clearView() {
		channelsInput = ''
		tagsInput = ''
		tagsModeValue = 'any'
		sortValue = ''
		limitValue = ''
		goto('/_debug/views', {replaceState: true})
	}

	// Live query: fetch by channels, sort (no limit — applied after tag filter)
	const tracksQuery = useLiveQuery((q) => {
		if (!view.channels?.length) return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, []))
		return q
			.from({tracks: tracksCollection})
			.where(({tracks}) => inArray(tracks.slug, view.channels))
			.orderBy(({tracks}) => tracks.created_at, view.sort === 'oldest' ? 'asc' : 'desc')
	})

	// Post-filter by tags, then limit
	const tracks = $derived.by(() => {
		let data = tracksQuery.data ?? []
		if (view.tags?.length) {
			const match = view.tagsMode === 'all' ? 'every' : 'some'
			data = data.filter((t) => t.tags?.[match]((tag) => view.tags?.includes(tag)))
		}
		if (view.limit) data = data.slice(0, view.limit)
		return data
	})
</script>

<svelte:head>
	<title>Views</title>
</svelte:head>

<article class="container">
	<h1>Views</h1>
	<p>A view is a recipe: channels + tags + sort + limit. URL-driven, reactive.</p>

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			applyView()
		}}
	>
		<fieldset>
			<label>
				Channels (comma-separated slugs)
				<input type="text" bind:value={channelsInput} placeholder="tropicalia, oskar, ko002" />
			</label>
		</fieldset>
		<fieldset>
			<label>
				Tags (comma-separated)
				<input type="text" bind:value={tagsInput} placeholder="ambient, dub, jazz" />
			</label>
			<label>
				Match
				<select bind:value={tagsModeValue}>
					<option value="any">any tag</option>
					<option value="all">all tags</option>
				</select>
			</label>
		</fieldset>
		<fieldset class="row">
			<label>
				Sort
				<select bind:value={sortValue}>
					<option value="">default</option>
					<option value="newest">newest</option>
					<option value="oldest">oldest</option>
				</select>
			</label>
			<label>
				Limit
				<input type="number" bind:value={limitValue} placeholder="50" min="1" max="500" />
			</label>
		</fieldset>
		<menu>
			<button type="submit">Apply</button>
			<button type="button" onclick={clearView}>Clear</button>
		</menu>
	</form>

	<details open>
		<summary>Parsed view</summary>
		<pre><code>{JSON.stringify(view, null, 2)}</code></pre>
	</details>

	{#if !hasFilter}
		<p>Add at least one channel or tag to start.</p>
	{:else if !tracksQuery.isReady}
		<p>Loading tracks…</p>
	{:else if tracks.length}
		<p>{tracks.length} tracks</p>
		<Tracklist {tracks} />
	{:else}
		<p>No tracks match this view</p>
	{/if}
</article>
