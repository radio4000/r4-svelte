<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {getTracksQueryCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import Tracklist from '$lib/components/tracklist.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {relativeDate} from '$lib/dates'
	import {extractHashtags, extractMentions} from '$lib/utils'
	import {findChannelBySlug} from '$lib/search'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist, togglePlayPause} from '$lib/api'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {getAutoDecksForView} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'

	const PREVIEW_LIMIT = 8
	const FEATURED_LIMIT = 10
	const CHANNELS_TAB = '__channels__'

	const tracksQuery = getTracksQueryCtx()

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
	let allTracks = $derived(tracksQuery.data || [])
	let previewTracks = $derived(allTracks.slice(0, PREVIEW_LIMIT))
	let canEdit = $derived(canEditChannel(channel?.id))

	// Featured tags/channels parsed from description
	let featuredTags = $derived(
		extractHashtags(channel?.description ?? '')
			.map((t) => t.slice(1))
			.slice(0, FEATURED_LIMIT) // strip #
	)
	let featuredMentions = $derived(
		extractMentions(channel?.description ?? '')
			.map((s) => s.slice(1))
			.slice(0, FEATURED_LIMIT) // strip @
	)

	// Per-tag sections — store full matching list, slice only for display
	let tagSections = $derived(
		featuredTags.map((tag) => {
			const tracks = allTracks.filter((t) => t.tags?.includes(tag))
			return {tag, tracks}
		})
	)

	// Only featured tags that actually have tracks
	let availableTagSections = $derived(tagSections.filter((s) => s.tracks.length > 0))

	// Tags active in any deck's playlist
	const deckPlaylistTags = $derived([
		...new Set(
			Object.values(appState.decks).flatMap(
				(d) =>
					d.playlist_title
						?.split(' ')
						.filter((t) => t.startsWith('#'))
						.map((t) => t.slice(1)) ?? []
			)
		)
	])

	// Per-tag sections for deck tags NOT already in featuredTags (avoids duplicate tabs)
	let deckOnlyTagSections = $derived(
		deckPlaylistTags
			.filter((tag) => !featuredTags.includes(tag))
			.map((tag) => ({tag, tracks: allTracks.filter((t) => t.tags?.includes(tag))}))
			.filter((s) => s.tracks.length > 0)
	)

	let mentionedChannels = $state<import('$lib/types').Channel[]>([])
	$effect(() => {
		const slugs = featuredMentions
		if (!slugs.length) {
			mentionedChannels = []
			return
		}
		let stale = false
		Promise.all(slugs.map(findChannelBySlug))
			.then((results) => {
				if (stale) return
				mentionedChannels = results.filter((c) => c !== undefined) as import('$lib/types').Channel[]
			})
			.catch(() => {})
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

	// Tab selection — null means "Latest"
	let selectedTag = $state<string | null>(null)

	// Reset if selected tab is no longer available
	$effect(() => {
		const allSections = [...availableTagSections, ...deckOnlyTagSections]
		if (selectedTag === CHANNELS_TAB && mentionedChannels.length === 0) {
			selectedTag = null
		} else if (
			selectedTag !== null &&
			selectedTag !== CHANNELS_TAB &&
			!allSections.some((s) => s.tag === selectedTag)
		) {
			selectedTag = null
		}
	})

	const activeDeck = $derived(appState.decks[appState.active_deck_id])
	const isTagPlaying = (tag: string) => {
		if (!activeDeck?.is_playing) return false
		const titleTags =
			activeDeck.playlist_title
				?.split(' ')
				.filter((t) => t.startsWith('#'))
				.map((t) => t.slice(1)) ?? []
		if (titleTags.includes(tag)) return true
		if (!slug) return false
		return getAutoDecksForView([activeDeck], {channels: [slug], tags: [tag]}).length > 0
	}

	async function playTracks(tracks: {id: string}[], title?: string) {
		const ids = tracks.map((t) => t.id)
		await playTrack(appState.active_deck_id, ids[0], null, 'play_search')
		setPlaylist(appState.active_deck_id, ids, title ? {title} : undefined)
	}

	function queueTracks(tracks: {id: string}[]) {
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
		<div class="search-bar">
			<SearchInput bind:value={searchInput} placeholder={m.channel_tracks_search_placeholder()} debounce={300} />
		</div>

		<div class="channel-meta">
			{#if channel.description}
				<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
			{/if}
			<div class="meta-row">
				{#if channel.url}
					<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				{/if}
				<p class="dates">
					<small>{m.channel_updated({date: relativeDate(channel.latest_track_at ?? channel.updated_at)})}</small>
				</p>
			</div>
		</div>

		<section class="track-section">
			{#if deckOnlyTagSections.length > 0 || availableTagSections.length > 0 || mentionedChannels.length > 0}
				<nav class="tabs">
					{#each deckOnlyTagSections as { tag, tracks } (tag)}
						<button
							type="button"
							data-deck-active
							class:active={selectedTag === tag}
							onclick={() => (selectedTag = tag)}
						>
							#{tag} <small>({tracks.length})</small>
						</button>
					{/each}
					<button type="button" class:active={selectedTag === null} onclick={() => (selectedTag = null)}>
						{m.channel_section_latest()} <small>({PREVIEW_LIMIT})</small>
					</button>
					{#each availableTagSections as { tag, tracks } (tag)}
						<button
							type="button"
							data-deck-active={deckPlaylistTags.includes(tag) || undefined}
							class:active={selectedTag === tag}
							onclick={() => (selectedTag = tag)}
						>
							#{tag} <small>({tracks.length})</small>
						</button>
					{/each}
					{#if mentionedChannels.length > 0}
						<button
							type="button"
							class:active={selectedTag === CHANNELS_TAB}
							onclick={() => (selectedTag = CHANNELS_TAB)}
						>
							{m.channel_section_radios()} <small>({mentionedChannels.length})</small>
						</button>
					{/if}
				</nav>
			{/if}

			{#if selectedTag === null}
				{#if tracksQuery.isReady && previewTracks.length > 0}
					{@const autoView = slug ? {channels: [slug]} : undefined}
					{@const autoDecks = getAutoDecksForView(Object.values(appState.decks), autoView)}
					{@const isAutoActive = autoDecks.length > 0}
					{@const isAutoDrifted = autoDecks.some((d) => d.auto_radio_drifted)}
					<header>
						<menu>
							<button
								type="button"
								onclick={() =>
									activeDeck?.is_playing ? togglePlayPause(appState.active_deck_id) : playTracks(allTracks)}
								title={activeDeck?.is_playing ? m.common_pause() : m.channel_play_latest()}
							>
								<Icon icon={activeDeck?.is_playing ? 'pause' : 'play-fill'} size={14} />
							</button>
							<button type="button" onclick={() => queueTracks(allTracks)} title={m.search_queue_all()}>
								<Icon icon="next-fill" size={14} />
							</button>
							{#if hasAutoRadioCoverage(allTracks)}
								<AutoRadioButton
									synced={isAutoActive && !isAutoDrifted}
									title={isAutoDrifted ? m.auto_radio_resync() : m.auto_radio_join()}
									size={14}
									onclick={() => autoView && joinAutoRadio(appState.active_deck_id, toAutoTracks(allTracks), autoView)}
								/>
							{/if}
						</menu>
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
				{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
					<p class="empty">{m.channel_loading_tracks()}</p>
				{:else if tracksQuery.isReady && allTracks.length === 0}
					<p class="empty">
						{#if canEdit}
							<a href="/add">{m.channel_first_track_cta()}</a>
						{:else}
							{m.channel_no_tracks()}
						{/if}
					</p>
				{/if}
			{:else if selectedTag === CHANNELS_TAB}
				<ul class="grid grid--scroll">
					{#each mentionedChannels as ch (ch.id)}
						<li><ChannelCard channel={ch} /></li>
					{/each}
				</ul>
			{:else}
				{@const section =
					availableTagSections.find((s) => s.tag === selectedTag) ??
					deckOnlyTagSections.find((s) => s.tag === selectedTag)}
				{#if section}
					<header>
						<menu>
							<button
								type="button"
								onclick={() =>
									isTagPlaying(section.tag)
										? togglePlayPause(appState.active_deck_id)
										: playTracks(section.tracks, `#${section.tag}`)}
								title={isTagPlaying(section.tag)
									? m.channel_pause_tag({tag: section.tag})
									: m.channel_play_tag({tag: section.tag})}
							>
								<Icon icon={isTagPlaying(section.tag) ? 'pause' : 'play-fill'} size={14} />
							</button>
							<button
								type="button"
								onclick={() => queueTracks(section.tracks)}
								title={m.channel_queue_tag({tag: section.tag})}
							>
								<Icon icon="next-fill" size={14} />
							</button>
							{#if channel}
								{@const autoTagTracks = toAutoTracks(section.tracks)}
								{@const autoTagView = slug ? {channels: [slug], tags: [section.tag]} : undefined}
								{@const autoTagDecks = getAutoDecksForView(Object.values(appState.decks), autoTagView)}
								{@const isAutoTagActive = autoTagDecks.length > 0}
								{@const isAutoTagDrifted = autoTagDecks.some((d) => d.auto_radio_drifted)}
								{#if hasAutoRadioCoverage(section.tracks)}
									<AutoRadioButton
										synced={isAutoTagActive && !isAutoTagDrifted}
										title={isAutoTagDrifted ? m.auto_radio_resync() : m.auto_radio_join()}
										size={14}
										onclick={() => autoTagView && joinAutoRadio(appState.active_deck_id, autoTagTracks, autoTagView)}
									/>
								{/if}
							{/if}
						</menu>
					</header>
					<Tracklist
						tracks={section.tracks.slice(0, PREVIEW_LIMIT)}
						playlistTracks={section.tracks}
						playlistTitle="#{section.tag}"
						{canEdit}
						grouped={false}
						virtual={false}
						playContext={true}
					/>
					<footer>
						<a href="/{slug}/tracks?tags={section.tag}">All {section.tracks.length} #{section.tag}</a>
					</footer>
				{/if}
			{/if}
		</section>
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

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.dates {
		color: var(--gray-10);
		margin-left: auto;
	}

	.description {
		white-space: pre-line;
		overflow-wrap: break-word;
	}

	.url {
		font-style: italic;
		color: var(--gray-9);
	}

	.url a {
		color: inherit;
	}

	.track-section {
		border-top: 1px solid var(--gray-4);
	}

	.track-section > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.5rem 0.2rem;
		gap: 0.5rem;
	}

	.track-section > header h3 {
		font-size: var(--font-5);
		font-weight: 600;
		color: var(--gray-10);
	}

	.track-section > header menu {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		margin-left: auto;
	}

	.track-section footer {
		padding: 0.4rem;
		text-align: center;
	}

	.empty {
		padding: 1rem;
	}

	nav.tabs {
		padding: 0.5rem 0.5rem 0;
		border-bottom: 1px solid var(--gray-4);
	}

	nav.tabs button[data-deck-active] {
		color: var(--accent-9);
	}

	.track-section ul.grid {
		margin: 0;
		padding: 0.5rem;
	}
</style>
