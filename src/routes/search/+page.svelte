<script>
	import {page} from '$app/state'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import SearchStatus from '$lib/components/search-status.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {trap} from '$lib/focus'
	import {channelsCollection, tracksCollection} from '$lib/collections'
	import {useLiveQuery} from '$lib/tanstack-svelte-db-useLiveQuery-patched.svelte'
	import {or, and, ilike, eq} from '@tanstack/svelte-db'

	let searchQuery = $state('')

	// Watch for URL changes and update search
	$effect(() => {
		const urlSearch = page.url.searchParams.get('search')
		if (urlSearch && urlSearch !== searchQuery) {
			searchQuery = urlSearch
		} else if (!urlSearch && searchQuery) {
			searchQuery = ''
		}
	})

	// Parse @mention syntax: "@slug query" or "@slug"
	const parsedQuery = $derived(() => {
		const query = searchQuery.trim()
		if (!query || query.length < 2) return {type: 'empty'}

		if (query.startsWith('@')) {
			const mentionContent = query.slice(1).trim()
			const spaceIndex = mentionContent.indexOf(' ')

			if (spaceIndex > -1) {
				return {
					type: 'mention',
					channelSlug: mentionContent.slice(0, spaceIndex),
					trackQuery: mentionContent.slice(spaceIndex + 1).trim()
				}
			}
			return {type: 'mention', channelSlug: mentionContent, trackQuery: ''}
		}

		return {type: 'all', query}
	})

	// Search channels
	const channelsQuery = useLiveQuery(
		(q) => {
			const parsed = parsedQuery()
			if (parsed.type === 'empty') return undefined

			let query = q.from({channel: channelsCollection})

			if (parsed.type === 'mention') {
				// Exact slug match for @mention
				query = query.where(({channel}) => eq(channel.slug, parsed.channelSlug))
			} else {
				// Search in name, description, slug
				const pattern = `%${parsed.query}%`
				query = query.where(({channel}) =>
					or(ilike(channel.name, pattern), ilike(channel.description || '', pattern), ilike(channel.slug, pattern))
				)
			}

			return query.orderBy(({channel}) => channel.name, 'asc')
		},
		[searchQuery]
	)

	// Search tracks
	const tracksQuery = useLiveQuery(
		(q) => {
			const parsed = parsedQuery()
			if (parsed.type === 'empty') return undefined
			if (parsed.type === 'mention' && !parsed.trackQuery) return undefined

			let query = q.from({track: tracksCollection})

			if (parsed.type === 'mention') {
				// Filter by channel slug and track query
				const pattern = `%${parsed.trackQuery}%`
				query = query.where(({track}) =>
					and(
						eq(track.channel_slug, parsed.channelSlug),
						or(ilike(track.title, pattern), ilike(track.description || '', pattern))
					)
				)
			} else {
				// Search all tracks
				const pattern = `%${parsed.query}%`
				query = query.where(({track}) => or(ilike(track.title, pattern), ilike(track.description || '', pattern)))
			}

			return query.orderBy(({track}) => track.title, 'asc')
		},
		[searchQuery]
	)

	const channels = $derived(channelsQuery.data || [])
	const tracks = $derived(tracksQuery.data || [])
	const isLoading = $derived(channelsQuery.status === 'loading' || tracksQuery.status === 'loading')

	async function playSearchResults() {
		const ids = tracks.map((t) => t.id)
		await setPlaylist(ids)
		await playTrack(ids[0], null, 'play_search')
	}
</script>

<svelte:head>
	<title>Search - R5</title>
</svelte:head>

<article use:trap>
	<menu>
		{#if searchQuery && !isLoading && tracks.length > 0}
			<button type="button" onclick={playSearchResults}>Play all</button>
			<button type="button" onclick={() => addToPlaylist(tracks.map((t) => t.id))}>Queue all</button>
		{/if}
		<SearchStatus {searchQuery} channelCount={channels.length} trackCount={tracks.length} />
	</menu>

	{#if searchQuery && !isLoading}
		{#if channels.length === 0 && tracks.length === 0}
			<p>No results found for "{searchQuery}"</p>
			<p>Tip: use @slug to find tracks in a channel</p>
		{/if}

		{#if channels.length > 0}
			<section>
				<h2 style="margin-left:0.5rem">{channels.length} Channels</h2>
				<ul class="grid">
					{#each channels as channel (channel.id)}
						<li>
							<ChannelCard {channel} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if tracks.length > 0}
			<section>
				<h2>Tracks ({tracks.length})</h2>
				<ul class="list">
					{#each tracks as track, index (track.id)}
						<li>
							<TrackCard {track} {index} showSlug={true} />
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else if !searchQuery}
		<p>
			TIP:
			<br /> Use the search input in the header
			<br /> <code>@channel</code> to search channels
			<br /> <code>@channel query</code> to search tracks within a channel
			<br /><code>/</code> for commands
		</p>
	{/if}
</article>

<style>
	article > p {
		margin-left: 0.5rem;
		margin-right: 0.5rem;
	}

	menu {
		margin: 0.5rem 0.5rem 2rem;
		align-items: center;
	}

	menu,
	section {
		margin-bottom: 2rem;
	}

	.grid :global(article h3 + p) {
		display: none;
	}
</style>
