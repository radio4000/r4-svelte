<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {parseView, serializeView, type View} from '$lib/views'
	import {useLiveQuery} from '$lib/tanstack-debug/useLiveQuery.svelte'
	import {tracksCollection, queryClient} from '$lib/tanstack/collections'
	import type {Track} from '$lib/types'
	import {fuzzySearch} from '$lib/search'
	import Tracklist from '$lib/components/tracklist.svelte'
	import SortControls from '$lib/components/sort-controls.svelte'
	import {inArray} from '@tanstack/db'
	import {shuffleArray} from '$lib/utils'
	import {Debounced} from 'runed'

	// The view — single derived from URL, the source of truth
	const view = $derived(parseView(page.url.searchParams))
	const hasFilter = $derived(!!view.channels?.length || !!view.tags?.length)

	// Form inputs: $state initialized once from URL, not $derived (avoids URL→form feedback loop)
	const init = parseView(new URLSearchParams(page.url.search))
	let channelsInput = $state(init.channels?.join(', ') || '')
	let tagsInput = $state(init.tags?.join(', ') || '')
	let tagsModeValue: 'any' | 'all' = $state(init.tagsMode || 'any')
	let orderValue: View['order'] = $state(init.order || 'created')
	let directionValue: 'asc' | 'desc' = $state(init.direction || 'desc')
	let limitValue = $state(init.limit ? String(init.limit) : '')
	let searchInput = $state(init.search || '')

	// Build view from current form state (reads raw inputs)
	function buildView(): View {
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
		if (!ch.length && !v.limit) {
			v.limit = 5
			limitValue = '5'
		}
		return v
	}

	// Debounce form → URL sync
	const debouncedView = new Debounced(() => JSON.stringify(buildView()), 200)

	$effect(() => {
		const serialized = debouncedView.current
		if (!serialized) return
		const v: View = JSON.parse(serialized)
		goto(`/_debug/views?${serializeView(v)}`, {replaceState: true})
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

	// One live query — collection queryFn handles both slug and tag fetches
	const tracksQuery = useLiveQuery((q) => {
		let query = q.from({tracks: tracksCollection})
		if (view.channels?.length) {
			query = query.where(({tracks}) => inArray(tracks.slug, view.channels))
		}
		if (view.tags?.length && !view.channels?.length) {
			// Tags .where() drives the queryFn for global tag queries.
			// When channels are present, tags are post-filtered (inArray can't filter array columns in-memory).
			query = query.where(({tracks}) => inArray(tracks.tags, view.tags))
		}
		if (!view.channels?.length && !view.tags?.length) {
			return query.where(({tracks}) => inArray(tracks.id, []))
		}
		const sortField = view.order === 'name' ? 'title' : view.order === 'updated' ? 'updated_at' : 'created_at'
		if (view.order !== 'shuffle')
			query = query.orderBy(({tracks}) => tracks[sortField], view.direction === 'asc' ? 'asc' : 'desc')
		return query
	})

	const loading = $derived(!tracksQuery.isReady)

	// Raw data: for channel queries useLiveQuery works; for tag-only, read query cache
	const rawData = $derived.by(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		tracksQuery.status // reactivity: re-derive when query completes
		if (view.channels?.length) return (tracksQuery.data ?? []) as Track[]
		if (view.tags?.length) {
			const key = ['tracks', 'tags', ...view.tags.toSorted()]
			return (queryClient.getQueryData(key) as Track[]) ?? []
		}
		return [] as Track[]
	})

	const totalCount = $derived(rawData.length)

	// Post-filter: tags (for channel queries), search, shuffle, limit
	const tracks = $derived.by(() => {
		let data = rawData
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
		if (view.order === 'shuffle') data = shuffleArray(data)
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
			goto(`/_debug/views?${serializeView(buildView())}`, {replaceState: true})
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
		<p>Add channels or tags to start.</p>
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
