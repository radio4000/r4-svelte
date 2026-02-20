<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/tanstack/collections'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {relativeDate} from '$lib/dates'
	import {extractHashtags, extractMentions} from '$lib/utils'
	import {findChannelBySlug} from '$lib/search'
	import {addToPlaylist, playTrack, setPlaylist} from '$lib/api'
	import * as m from '$lib/paraglide/messages'

	const PREVIEW_LIMIT = 10
	const TAG_PREVIEW_LIMIT = 5
	const FEATURED_LIMIT = 10

	const tracksQuery = getTracksQueryCtx()

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let previewTracks = $derived(allTracks.slice(0, PREVIEW_LIMIT))
	let canEdit = $derived(canEditChannel(channel?.id))

	// Featured tags/channels parsed from description
	let featuredTags = $derived(
		extractHashtags(channel?.description ?? '').map((t) => t.slice(1)).slice(0, FEATURED_LIMIT) // strip #
	)
	let featuredMentions = $derived(
		extractMentions(channel?.description ?? '').map((s) => s.slice(1)).slice(0, FEATURED_LIMIT) // strip @
	)

	// Per-tag sections — store full matching list, slice only for display
	let tagSections = $derived(
		featuredTags.map((tag) => {
			const tracks = allTracks.filter((t) => t.tags?.includes(tag))
			return {tag, tracks}
		})
	)

	let mentionedChannels = $state<import('$lib/types').Channel[]>([])
	$effect(() => {
		const slugs = featuredMentions
		if (!slugs.length) {
			mentionedChannels = []
			return
		}
		let stale = false
		Promise.all(slugs.map(findChannelBySlug)).then((results) => {
			if (stale) return
			mentionedChannels = results.filter((c) => c !== undefined) as import('$lib/types').Channel[]
		})
		return () => {
			stale = true
		}
	})

	let searchInput = $state('')
	$effect(() => {
		const q = searchInput.trim()
		if (!q) return
		goto(`/${slug}/tracks?search=${encodeURIComponent(q)}`)
	})

	function playTagTracks(tracks: {id: string}[], tag: string) {
		const ids = tracks.map((t) => t.id)
		setPlaylist(appState.active_deck_id, ids, {title: `#${tag}`})
		playTrack(appState.active_deck_id, ids[0], null, 'play_search')
	}

	function queueTagTracks(tracks: {id: string}[]) {
		addToPlaylist(
			appState.active_deck_id,
			tracks.map((t) => t.id)
		)
	}
</script>

<svelte:head>
	<title>{m.channel_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

{#if channel}
	<article>
		<div class="channel-meta">
			<p class="dates">
				<small>{m.channel_updated({date: relativeDate(channel.latest_track_at ?? channel.updated_at)})}</small>
			</p>
			{#if channel.url}
				<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
			{/if}
			{#if channel.description}
				<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
			{/if}
		</div>

		<div class="search-bar">
			<SearchInput bind:value={searchInput} placeholder="Search tracks..." debounce={300} />
		</div>

		{#if tracksQuery.isReady && previewTracks.length > 0}
			<section class="track-section">
				<header>
					<h3>Latest</h3>
					<a href="/{slug}/tracks">
						{allTracks.length > PREVIEW_LIMIT ? `All ${allTracks.length}` : `All`}
					</a>
				</header>
				<Tracklist
					tracks={previewTracks}
					playlistTracks={allTracks}
					{canEdit}
					grouped={false}
					virtual={false}
					playContext={true}
				/>
				<footer><a href="/{slug}/tracks">All {allTracks.length} tracks</a></footer>
			</section>
		{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
			<p class="empty">{m.channel_loading_tracks()}</p>
		{:else if tracksQuery.isReady && allTracks.length === 0}
			<p class="empty">
				{#if canEdit}
					<a href="/add">Add your first track (tip: press "c")</a>
				{:else}
					No tracks yet
				{/if}
			</p>
		{/if}

		{#if mentionedChannels.length > 0}
			<section class="featured-channels">
				<header><h3>Featured radios</h3></header>
				<ul class="grid grid--scroll">
					{#each mentionedChannels as ch (ch.id)}
						<li><ChannelCard channel={ch} /></li>
					{/each}
				</ul>
			</section>
		{/if}

		{#each tagSections as { tag, tracks } (tag)}
			{#if tracks.length > 0}
				<section class="track-section">
					<header>
						<h3><a href="/{slug}/tracks?tags={tag}">#{tag}</a></h3>
						<menu>
							<button type="button" onclick={() => playTagTracks(tracks, tag)} title="Play #{tag}">
								<Icon icon="play-fill" size={14} />
							</button>
							<button type="button" onclick={() => queueTagTracks(tracks)} title="Queue #{tag}">
								<Icon icon="next-fill" size={14} />
							</button>
							{#if tracks.length > TAG_PREVIEW_LIMIT}
								<a href="/{slug}/tracks?tags={tag}">All {tracks.length}</a>
							{/if}
						</menu>
					</header>
					<Tracklist
						tracks={tracks.slice(0, TAG_PREVIEW_LIMIT)}
						playlistTracks={tracks}
						playlistTitle="#{tag}"
						{canEdit}
						grouped={false}
						virtual={false}
						playContext={true}
					/>
				</section>
			{/if}
		{/each}
	</article>
{/if}

<style>
	article {
		display: flex;
		flex-direction: column;
	}

	.channel-meta {
		margin: 0.75rem;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: var(--gray-2);
		border: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
	}

	.search-bar {
		padding: 0.5rem 0.75rem;
	}

	.search-bar :global(.search-input) {
		width: 100%;
	}

	.search-bar :global(input[type='search']) {
		width: 100%;
	}

	.dates {
		color: var(--gray-10);
	}

	.description {
		white-space: pre-line;
	}

	/* Pill-style links inside the description (tags + mentions from LinkEntities) */
	.description :global(a),
	.description :global(.tag-link) {
		display: inline-flex;
		align-items: center;
		padding: 0.12rem 0.45rem;
		border: 1px solid var(--gray-5);
		border-radius: 999px;
		text-decoration: none;
		margin: 0 0.2rem 0.2rem 0;
		vertical-align: middle;
	}

	.url {
		font-style: italic;
		color: var(--gray-9);
	}

	.url a {
		color: inherit;
	}

	.track-section,
	.featured-channels {
		border-top: 1px solid var(--gray-4);
	}

	.track-section > header,
	.featured-channels > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.5rem 0.2rem;
		gap: 0.5rem;
	}

	.track-section > header h3,
	.featured-channels > header h3 {
		font-size: var(--font-3);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gray-10);
	}

	.track-section > header menu {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		margin-left: auto;
	}

	.featured-channels ul {
		margin: 0;
		padding: 0 0.5rem 0.5rem;
	}

	.track-section footer {
		padding: 0.4rem;
		text-align: center;
	}

	.empty {
		padding: 1rem;
	}
</style>
