<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {parseView, serializeView, type View} from '$lib/views'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {tracksCollection, fetchTracksGlobal} from '$lib/tanstack/collections'
	import {fuzzySearch} from '$lib/search'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {inArray} from '@tanstack/db'
	import {shuffleArray} from '$lib/utils'
	import {Debounced} from 'runed'

	// The view — single derived from URL, the source of truth
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.search || !!view.limit)
	const globalQuery = $derived(!view.channels?.length)

	// Form inputs (mutable, synced from URL on load)
	let channelsInput = $state(page.url.searchParams.get('channels') || '')
	let tagsInput = $state(page.url.searchParams.get('tags') || '')
	let tagsModeValue = $state(page.url.searchParams.get('tagsMode') || 'any')
	let orderValue: NonNullable<View['order']> = $state(
		(page.url.searchParams.get('order') as View['order']) || 'created'
	)
	let directionValue: NonNullable<View['direction']> = $state(
		(page.url.searchParams.get('direction') as View['direction']) || 'desc'
	)
	let limitValue = $state(page.url.searchParams.get('limit') || '')
	let searchInput = $state(page.url.searchParams.get('search') || '')

	// Global fetch: load into collection, track IDs for scoping
	let globalTrackIds: string[] = $state([])
	let globalLoading = $state(false)

	async function fetchGlobal(v: View) {
		globalLoading = true
		try {
			const data = await fetchTracksGlobal({
				tags: v.tags,
				tagsMode: v.tagsMode,
				search: v.search,
				order: v.order,
				direction: v.direction,
				limit: v.limit
			})
			// Pour into the lake — deduped by track.id
			tracksCollection.utils.writeBatch(() => {
				for (const track of data) {
					tracksCollection.utils.writeUpsert(track)
				}
			})
			globalTrackIds = data.map((t) => t.id)
		} catch (e) {
			console.error('fetchGlobal', e)
			globalTrackIds = []
		} finally {
			globalLoading = false
		}
	}

	function applyView() {
		const v: View = {}
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
		if (searchInput.trim()) v.search = searchInput.trim()
		v.order = orderValue
		v.direction = directionValue
		const n = Number(limitValue)
		if (n > 0) v.limit = n
		// Enforce limit when querying without channels
		if (!ch.length && !v.limit) {
			v.limit = 5
			limitValue = '5'
		}
		goto(`/_debug/views?${serializeView(v)}`, {replaceState: true})
		// No channels: fetch globally from supabase
		if (!ch.length) fetchGlobal(v)
	}

	// Debounce text inputs, then auto-apply everything reactively
	const dChannels = new Debounced(() => channelsInput, 200)
	const dTags = new Debounced(() => tagsInput, 200)
	const dLimit = new Debounced(() => limitValue, 200)
	const dSearch = new Debounced(() => searchInput, 300)

	$effect(() => {
		// Instant: selects/sort. Debounced: text/number inputs.
		tagsModeValue
		orderValue
		directionValue
		dChannels.current
		dTags.current
		dLimit.current
		dSearch.current
		applyView()
	})

	function reshuffle() {
		if (globalQuery) fetchGlobal(view)
	}

	function clearView() {
		channelsInput = ''
		tagsInput = ''
		tagsModeValue = 'any'
		orderValue = 'created'
		directionValue = 'desc'
		limitValue = ''
		searchInput = ''
		globalTrackIds = []
		goto('/_debug/views', {replaceState: true})
	}

	// One live query — channels scope by slug, global scopes by fetched IDs
	const tracksQuery = useLiveQuery((q) => {
		let query = q.from({tracks: tracksCollection})
		if (view.channels?.length) {
			query = query.where(({tracks}) => inArray(tracks.slug, view.channels))
		} else if (globalTrackIds.length) {
			query = query.where(({tracks}) => inArray(tracks.id, globalTrackIds))
		} else {
			// No data loaded yet — empty result
			return query.where(({tracks}) => inArray(tracks.id, []))
		}
		const sortField = view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
		if (view.order !== 'shuffle')
			query = query.orderBy(({tracks}) => tracks[sortField], view.direction === 'asc' ? 'asc' : 'desc')
		return query
	})

	const loading = $derived(globalQuery ? globalLoading : !tracksQuery.isReady)
	const totalCount = $derived(tracksQuery.data?.length ?? 0)

	// Post-filter: tags (channel queries), search (channel queries), shuffle, limit
	const tracks = $derived.by(() => {
		let data = tracksQuery.data ?? []
		// Tag filter for channel queries (global already filtered by supabase)
		if (!globalQuery && view.tags?.length) {
			if (view.tagsMode === 'all') {
				data = data.filter((t) => view.tags!.every((tag) => t.tags?.includes(tag)))
			} else {
				data = data.filter((t) => t.tags?.some((tag) => view.tags?.includes(tag)))
			}
		}
		// Search: channel queries use local fuzzy (global already filtered by FTS)
		if (!globalQuery && view.search) {
			data = fuzzySearch(view.search, data, ['title', 'description'])
		}
		// Channel queries: shuffle locally. Global queries: already randomized by fetchTracksGlobal.
		if (view.order === 'shuffle' && !globalQuery) data = shuffleArray(data)
		if (view.limit) data = data.slice(0, view.limit)
		return data
	})
</script>

<svelte:head>
	<title>Views</title>
</svelte:head>

<article class="container">
	<header>
		<h1>Views</h1>
		<p>URL -> view -> query -> collection -> reactive</p>
	</header>

	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			applyView()
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
				<input id="tags" type="text" bind:value={tagsInput} placeholder="ambient, dub, jazz" />
				<label class="visually-hidden" for="tagsMode">Match</label>
				<select id="tagsMode" bind:value={tagsModeValue}>
					<option value="any">any tag</option>
					<option value="all">all tags</option>
				</select>
			</fieldset>
		</fieldset>
		<fieldset>
			<label for="search">Search</label>
			<input id="search" type="text" bind:value={searchInput} placeholder="miles davis" />
		</fieldset>
		<fieldset class="row">
			<legend>Sort</legend>
			<SortControls bind:order={orderValue} bind:direction={directionValue} onreshuffle={reshuffle} />
			<label for="limit">Limit</label>
			<input id="limit" type="number" bind:value={limitValue} placeholder="10" min="1" max="500" />
		</fieldset>
		<menu>
			<!--<button type="submit">Apply</button>-->
			<button type="button" onclick={clearView}>Clear</button>
		</menu>
	</form>
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a limit to start.</p>
	{:else if loading}
		<p>Loading tracks…</p>
	{:else if tracks.length}
		<p>{tracks.length}{tracks.length < totalCount ? ` of ${totalCount}` : ''} tracks</p>
	{/if}
</div>

{#if tracks.length}
	<Tracklist {tracks} />
{/if}

<style>
	header {
		margin-block: 0.5rem 1rem;
	}
</style>
