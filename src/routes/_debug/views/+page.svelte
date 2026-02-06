<script lang="ts">
	import {page} from '$app/state'
	import {goto, afterNavigate} from '$app/navigation'
	import {parseView, serializeView, type View} from '$lib/views'
	import {useLiveQuery} from '@tanstack/svelte-db'
	// import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte' // custom version (more performant, includeInitialState: false)
	import {tracksCollection} from '$lib/tanstack/collections'
	import type {Track} from '$lib/types'
	import {fuzzySearch} from '$lib/search'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {inArray, eq} from '@tanstack/db'
	import {shuffleArray} from '$lib/utils'
	import {Debounced} from 'runed'

	// The view — single derived from URL, the source of truth
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length || !!view.search)

	// Stable primitive strings for live query — only change when the actual query params change.
	// Avoids re-creating the collection on sort/direction/limit changes (same pattern as [slug]/+layout).
	const qChannels = $derived(page.url.searchParams.get('channels') || '')
	const qTags = $derived(page.url.searchParams.get('tags') || '')
	const qSearch = $derived(page.url.searchParams.get('search') || '')

	// Form inputs: initialized from URL, synced on navigation (not $derived — avoids URL→form feedback loop)
	const initialView = parseView(page.url.searchParams)
	let channelsInput = $state(initialView.channels?.join(', ') || '')
	let tagsInput = $state(initialView.tags?.join(', ') || '')
	let tagsModeValue: 'any' | 'all' = $state(initialView.tagsMode || 'any')
	let orderValue: View['order'] = $state(initialView.order || 'created')
	let directionValue: 'asc' | 'desc' = $state(initialView.direction || 'desc')
	let limitValue = $state(initialView.limit ? String(initialView.limit) : '')
	let searchInput = $state(initialView.search || '')

	// Sync URL → form on navigation (initial load, back/forward, links) — skips our own goto
	afterNavigate(({type}) => {
		if (type === 'goto') return
		const v = parseView(page.url.searchParams)
		channelsInput = v.channels?.join(', ') || ''
		tagsInput = v.tags?.join(', ') || ''
		tagsModeValue = v.tagsMode || 'any'
		orderValue = v.order || 'created'
		directionValue = v.direction || 'desc'
		limitValue = v.limit ? String(v.limit) : ''
		searchInput = v.search || ''
	})

	// Per-input debounce: expensive inputs (trigger fetches) get 250ms, cheap ones are instant
	const dChannels = new Debounced(() => channelsInput, 250)
	const dTags = new Debounced(() => tagsInput, 250)
	const dSearch = new Debounced(() => searchInput, 250)

	// Derive view from debounced (expensive) + direct (cheap) inputs
	const formView = $derived.by((): View => {
		const v: View = {}
		const ch = [
			...new Set(
				(dChannels.current ?? '')
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			)
		]
		if (ch.length) v.channels = ch
		const tg = [
			...new Set(
				(dTags.current ?? '')
					.split(',')
					.map((s) => s.trim().replace(/^#/, ''))
					.filter(Boolean)
			)
		]
		if (tg.length) v.tags = tg
		if (tagsModeValue === 'all') v.tagsMode = 'all'
		const search = (dSearch.current ?? '').trim()
		if (search) v.search = search
		v.order = orderValue
		v.direction = directionValue
		const n = Number(limitValue)
		if (n > 0) v.limit = n
		if (!ch.length && !tg.length && !search && !v.limit) v.limit = 5
		return v
	})

	$effect(() => {
		goto(`/_debug/views?${serializeView(formView)}`, {replaceState: true})
	})

	function clearView() {
		channelsInput = ''
		tagsInput = ''
		tagsModeValue = 'any'
		orderValue = 'created'
		directionValue = 'desc'
		limitValue = ''
		searchInput = ''
		goto('/_debug/views', {replaceState: true})
	}

	// One live query — reads stable primitive strings so sort/direction/limit changes don't re-create the collection
	const tracksQuery = useLiveQuery((q) => {
		const channels = qChannels ? qChannels.split(',').filter(Boolean) : []
		const tags = qTags ? qTags.split(',').filter(Boolean) : []
		const search = qSearch.trim()

		let query = q.from({tracks: tracksCollection})
		if (channels.length) {
			query = query.where(({tracks}) => inArray(tracks.slug, channels))
		}
		if (tags.length && !channels.length) {
			// Tags .where() drives the queryFn for global tag queries.
			// When channels are present, tags are post-filtered (inArray can't filter array columns in-memory).
			query = query.where(({tracks}) => inArray(tracks.tags, tags))
		}
		if (search && !channels.length && !tags.length) {
			query = query.where(({tracks}) => eq(tracks.fts, search))
		}
		if (!channels.length && !tags.length && !search) {
			return query.where(({tracks}) => inArray(tracks.id, []))
		}
		return query
	})

	const loading = $derived(!tracksQuery.isReady)

	// Post-filter: tags (for channel queries), search, shuffle, limit
	const tracks = $derived.by(() => {
		let data = (tracksQuery.data ?? []) as Track[]
		if (view.channels?.length && view.tags?.length) {
			// Channel queries: tags are post-filtered (inArray can't match array columns)
			if (view.tagsMode === 'all') {
				data = data.filter((t) => view.tags!.every((tag) => t.tags?.includes(tag)))
			} else {
				data = data.filter((t) => t.tags?.some((tag) => view.tags!.includes(tag)))
			}
		} else if (view.tagsMode === 'all' && view.tags?.length) {
			// Tag-only queries: supabase used overlaps (any), so post-filter for "all" mode
			data = data.filter((t) => view.tags!.every((tag) => t.tags?.includes(tag)))
		}
		if (view.search) {
			data = fuzzySearch(view.search, data, ['title', 'description'])
		}
		if (view.order === 'shuffle') {
			data = shuffleArray(data)
		} else {
			const sortField = view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
			const dir = view.direction === 'asc' ? 1 : -1
			data = data.toSorted((a, b) => {
				const va = a[sortField] ?? ''
				const vb = b[sortField] ?? ''
				return va < vb ? -dir : va > vb ? dir : 0
			})
		}
		if (view.limit) data = data.slice(0, view.limit)
		return data
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
		<p>URL -> view -> query -> collection -> reactive</p>
	</header>

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
			<SortControls bind:order={orderValue} bind:direction={directionValue} />
			<label for="limit">Limit</label>
			<input id="limit" type="number" bind:value={limitValue} placeholder="10" min="1" max="4000" />
		</fieldset>
		<menu>
			<!--<button type="submit">Apply</button>-->
			<button type="button" onclick={clearView}>Clear</button>
		</menu>
	</form>
</article>

<div class="container">
	{#if !hasFilter}
		<p>Add channels, tags, or a search to start.</p>
	{:else if loading}
		<p>Loading tracks…</p>
	{:else if tracks.length}
		<p>{tracks.length} tracks</p>
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
