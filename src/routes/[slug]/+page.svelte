<script lang="ts">
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {goto} from '$app/navigation'
	import {getChannelCtx, getTracksQueryCtx} from '$lib/contexts'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import Tracklist from '$lib/components/tracklist.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Icon from '$lib/components/icon.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {relativeDate} from '$lib/dates'
	import {extractHashtags, channelAvatarUrl} from '$lib/utils'
	import {addToPlaylist, joinAutoRadio, playTrack, setPlaylist, togglePlayPause} from '$lib/api'
	import {toAutoTracks, hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {getAutoDecksForView} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'
	import Seo from '$lib/components/seo.svelte'

	const SECTION_TRACK_LIMIT = 50
	const FEATURED_LIMIT = 10

	const channelCtx = getChannelCtx()
	const tracksQuery = getTracksQueryCtx()

	let slug = $derived(page.params.slug as string)
	let channel = $derived(channelCtx.data)
	let allTracks = $derived(tracksQuery.data || [])
	let previewTracks = $derived(allTracks.slice(0, SECTION_TRACK_LIMIT))
	let canEdit = $derived(canEditChannel(channel?.id))

	// Featured tags parsed from description
	let featuredTags = $derived(
		extractHashtags(channel?.description ?? '')
			.map((t) => t.slice(1))
			.slice(0, FEATURED_LIMIT) // strip #
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

	let searchInput = $state('')
	$effect(() => {
		const q = searchInput.trim()
		if (!q) return
		goto(`/${slug}/tracks?q=${encodeURIComponent(q)}`)
	})

	// Tag multi-selection — empty means "Latest"
	let selectedTags = $state<string[]>([])

	// Drop any selected tags that are no longer available
	$effect(() => {
		const validTags = new Set([...availableTagSections, ...deckOnlyTagSections].map((s) => s.tag))
		const filtered = selectedTags.filter((t) => validTags.has(t))
		if (filtered.length !== selectedTags.length) selectedTags = filtered
	})

	function toggleTag(tag: string) {
		selectedTags = selectedTags.includes(tag)
			? selectedTags.filter((t) => t !== tag)
			: [...selectedTags, tag]
	}

	// Tracks for the current selection
	let tagFilteredTracks = $derived(
		selectedTags.length === 0
			? allTracks
			: allTracks.filter((t) => selectedTags.every((tag) => t.tags?.includes(tag)))
	)
	let displayTracks = $derived(
		selectedTags.length === 0 ? previewTracks : tagFilteredTracks.slice(0, SECTION_TRACK_LIMIT)
	)
	let selectedPlaylistTitle = $derived(
		selectedTags.length > 0 ? selectedTags.map((t) => `#${t}`).join(' ') : undefined
	)

	const activeDeck = $derived(appState.decks[appState.active_deck_id])

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

<Seo
	title={channel?.name || m.channel_page_fallback()}
	description={channel?.description}
	image={channel?.image ? channelAvatarUrl(channel.image) : undefined}
	url={page.url.href}
	type="music.radio_station"
/>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	{#if deckOnlyTagSections.length > 0 || availableTagSections.length > 0}
		<PopoverMenu closeOnClick={false}>
			{#snippet trigger()}
				<Icon icon="hash" />{selectedTags.length > 0 ? `(${selectedTags.length})` : ''}
			{/snippet}
			<menu class="tags-menu">
				<button
					type="button"
					class:active={selectedTags.length === 0}
					onclick={() => (selectedTags = [])}
				>
					{m.channel_section_latest()}
					<span class="tag-count">({Math.min(allTracks.length, SECTION_TRACK_LIMIT)})</span>
				</button>
				{#each deckOnlyTagSections as { tag, tracks } (tag)}
					<button
						type="button"
						data-deck-active
						class:active={selectedTags.includes(tag)}
						onclick={() => toggleTag(tag)}
					>
						#{tag} <span class="tag-count">({tracks.length})</span>
					</button>
				{/each}
				{#each availableTagSections as { tag, tracks } (tag)}
					<button
						type="button"
						data-deck-active={deckPlaylistTags.includes(tag) || undefined}
						class:active={selectedTags.includes(tag)}
						onclick={() => toggleTag(tag)}
					>
						#{tag} <span class="tag-count">({tracks.length})</span>
					</button>
				{/each}
			</menu>
		</PopoverMenu>
	{/if}
	<SearchInput
		bind:value={searchInput}
		placeholder={m.channel_tracks_search_placeholder()}
		debounce={300}
	/>
	{#if selectedTags.length > 0 && tracksQuery.isReady && displayTracks.length > 0}
		{@const autoView = slug ? {sources: [{channels: [slug], tags: selectedTags}]} : undefined}
		{@const autoDecks = getAutoDecksForView(Object.values(appState.decks), autoView)}
		{@const isAutoActive = autoDecks.length > 0}
		{@const isAutoPlaying = autoDecks.some((d) => d.is_playing)}
		{@const isAutoDrifted = autoDecks.some((d) => d.auto_radio_drifted)}
		<button
			type="button"
			onclick={() =>
				activeDeck?.is_playing
					? togglePlayPause(appState.active_deck_id)
					: playTracks(tagFilteredTracks, selectedPlaylistTitle)}
			title={activeDeck?.is_playing ? m.common_pause() : m.channel_play_latest()}
		>
			<Icon icon={activeDeck?.is_playing ? 'pause' : 'play-fill'} />
		</button>
		<button
			type="button"
			onclick={() => queueTracks(tagFilteredTracks)}
			title={m.search_queue_all()}
		>
			<Icon icon="next-fill" />
		</button>
		{#if hasAutoRadioCoverage(tagFilteredTracks)}
			<AutoRadioButton
				synced={isAutoActive && isAutoPlaying && !isAutoDrifted}
				title={isAutoDrifted ? m.auto_radio_resync() : m.auto_radio_join()}
				onclick={() =>
					autoView &&
					joinAutoRadio(appState.active_deck_id, toAutoTracks(tagFilteredTracks), autoView)}
			/>
		{/if}
	{/if}
{/snippet}

{#if channel}
	<article>
		<div class="channel-meta">
			{#if channel.url}
				<div class="meta-row">
					<p class="url"><a href={channel.url} target="_blank" rel="noopener">{channel.url}</a></p>
				</div>
			{/if}
			<div class="meta-row">
				{#if channel.description}
					<p class="description"><LinkEntities slug={channel.slug} text={channel.description} /></p>
				{/if}
				<p class="dates">
					<small
						>{m.channel_updated({
							date: relativeDate(channel.latest_track_at ?? channel.updated_at)
						})}</small
					>
				</p>
			</div>
		</div>

		<section class="track-section">
			{#if tracksQuery.isReady && displayTracks.length > 0}
				<Tracklist
					tracks={displayTracks}
					playlistTracks={tagFilteredTracks}
					playlistTitle={selectedPlaylistTitle}
					{canEdit}
					grouped={false}
					virtual={false}
					playContext={true}
				/>
				<footer>
					{#if selectedTags.length === 0}
						<a href={resolve('/[slug]/tracks', {slug})} class="btn"
							>{m.channel_see_all_tracks({count: allTracks.length})}</a
						>
					{:else if selectedTags.length === 1}
						<a href={resolve('/[slug]/tracks', {slug}) + '?tags=' + selectedTags[0]} class="btn"
							>{m.channel_see_all_tag({count: tagFilteredTracks.length, tag: selectedTags[0]})}</a
						>
					{:else}
						<a
							href={resolve('/[slug]/tracks', {slug}) + '?tags=' + selectedTags.join(',')}
							class="btn">{m.channel_see_all_tracks({count: tagFilteredTracks.length})}</a
						>
					{/if}
				</footer>
			{:else if tracksQuery.isLoading && (channel.track_count ?? 0) > 0}
				<p class="empty">{m.channel_loading_tracks()}</p>
			{:else if tracksQuery.isReady && allTracks.length === 0}
				<p class="empty">{m.channel_no_tracks()}</p>
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
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.meta-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: flex-end;
		gap: 0.5rem;
	}

	.dates {
		color: var(--gray-10);
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.description {
		white-space: pre-line;
		overflow-wrap: break-word;
		font-stretch: 90%;
		font-style: italic;
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

		footer {
			padding: 1rem 0.5rem 0.5rem;
			text-align: center;
			position: sticky;
			bottom: 0;
			background: var(--gray-1);
			border-top: 1px solid var(--gray-4);
		}
	}

	.empty {
		padding: 1rem;
	}

	.tag-count {
		opacity: 0.6;
		font-size: 0.85em;
	}
</style>
