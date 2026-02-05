<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {parseView, serializeView} from '$lib/views'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {tracksCollection, fetchTracksGlobal} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {inArray} from '@tanstack/db'
	import {shuffleArray} from '$lib/utils'
	import {Debounced} from 'runed'
	import type {Track} from '$lib/types'

	// The view — single derived from URL, the source of truth
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.limit)
	const globalQuery = $derived(!view.channels?.length)

	// Form inputs (mutable, synced from URL on load)
	let channelsInput = $state(page.url.searchParams.get('channels') || '')
	let tagsInput = $state(page.url.searchParams.get('tags') || '')
	let tagsModeValue = $state(page.url.searchParams.get('tagsMode') || 'any')
	let orderValue = $state(page.url.searchParams.get('order') || 'created')
	let directionValue = $state(page.url.searchParams.get('direction') || 'desc')
	let limitValue = $state(page.url.searchParams.get('limit') || '')

	// Global fetch state (no channels — queries supabase directly)
	let globalData: Track[] = $state([])
	let globalLoading = $state(false)

	async function fetchGlobal(v: import('$lib/views').View) {
		globalLoading = true
		try {
			globalData = await fetchTracksGlobal({
				tags: v.tags,
				tagsMode: v.tagsMode,
				order: v.order,
				direction: v.direction,
				limit: v.limit
			})
		} catch (e) {
			console.error('fetchGlobal', e)
			globalData = []
		} finally {
			globalLoading = false
		}
	}

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

	$effect(() => {
		// Instant: selects/sort. Debounced: text/number inputs.
		tagsModeValue
		orderValue
		directionValue
		dChannels.current
		dTags.current
		dLimit.current
		applyView()
	})

	function clearView() {
		channelsInput = ''
		tagsInput = ''
		tagsModeValue = 'any'
		orderValue = 'created'
		directionValue = 'desc'
		limitValue = ''
		globalData = []
		goto('/_debug/views', {replaceState: true})
	}

	// Live query: channels → collection
	const tracksQuery = useLiveQuery((q) => {
		if (!view.channels?.length) return q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.id, []))
		const sortField = view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
		const sortDir = view.direction === 'asc' ? 'asc' : 'desc'
		let query = q.from({tracks: tracksCollection}).where(({tracks}) => inArray(tracks.slug, view.channels))
		if (view.order !== 'shuffle') query = query.orderBy(({tracks}) => tracks[sortField], sortDir)
		return query
	})

	const loading = $derived(globalQuery ? globalLoading : !tracksQuery.isReady)
	const totalCount = $derived(globalQuery ? globalData.length : (tracksQuery.data?.length ?? 0))

	// Post-filter by tags (when channels set), shuffle, limit
	const tracks = $derived.by(() => {
		let data = globalQuery ? globalData : (tracksQuery.data ?? [])
		// Tag filter needed for channel queries (global already filtered by supabase)
		if (!globalQuery && view.tags?.length) {
			const match = view.tagsMode === 'all' ? 'every' : 'some'
			data = data.filter((t) => t.tags?.[match]((tag) => view.tags?.includes(tag)))
		}
		if (view.order === 'shuffle') data = shuffleArray(data)
		if (view.limit) data = data.slice(0, view.limit)
		return data
	})
</script>

<svelte:head>
	<title>Views</title>
</svelte:head>

<article class="container">
	<h1>Views</h1>
	<p>A view is a recipe: channels + tags + order + limit. URL-driven, reactive.</p>

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
		<fieldset class="row">
			<SortControls bind:order={orderValue} bind:direction={directionValue} />
			<label for="limit">Limit</label>
			<input id="limit" type="number" bind:value={limitValue} placeholder="10" min="1" max="500" />
		</fieldset>
		<menu>
			<button type="submit">Apply</button>
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
