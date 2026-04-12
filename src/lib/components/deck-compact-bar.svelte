<script>
	import {eq} from '@tanstack/svelte-db'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState, canEditChannel, removeDeck} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {
		togglePlayPause,
		next,
		previous,
		getMediaPlayer,
		resyncAutoRadio,
		clearUserInitiatedPlay,
		toggleDeckCompact
	} from '$lib/api'
	import {getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast'
	import {getActiveQueue, canPlay, canPrev, canNext} from '$lib/player/queue'
	import {parseUrl} from 'media-now/parse-url'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import PlayerProgress from '$lib/components/player-progress.svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {channelPresence} from '$lib/presence.svelte'
	import {viewLabel} from '$lib/views'

	/** @type {{deckId: number, showEdgeControls?: boolean}} */
	let {deckId, showEdgeControls = true} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)
	let listeningDeckIds = $derived(
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
			.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	)
	let isListeningGroupControlDeck = $derived(
		!deck?.listening_to_channel_id || listeningDeckIds[0] === deckId
	)

	let track = $derived.by(() => {
		const id = deck?.playlist_track
		if (!id) return undefined
		void tracksCollection.state.size
		return tracksCollection.state.get(id)
	})
	let listeningBroadcastDeck = $derived.by(() => {
		const channelId = deck?.listening_to_channel_id
		if (!channelId) return undefined
		const trackId = deck?.playlist_track
		void broadcastsCollection.state.size
		const states = broadcastsCollection.state.get(channelId)?.decks
		if (!Array.isArray(states) || !states.length) return undefined
		return (trackId && states.find((state) => state?.track_id === trackId)) || states[0]
	})
	let broadcastTrack = $derived.by(() => {
		const state = listeningBroadcastDeck
		if (!state?.track_id) return undefined
		void tracksCollection.state.size
		const loaded = tracksCollection.state.get(state.track_id)
		if (loaded) return loaded
		if (!state.track_url) return undefined
		const parsed = parseUrl(state.track_url)
		const now = new Date().toISOString()
		return {
			id: state.track_id,
			url: state.track_url,
			title: state.track_title ?? state.track_id,
			media_id: state.track_media_id ?? null,
			provider: parsed?.provider ?? null,
			created_at: now,
			updated_at: now,
			slug: null
		}
	})

	const channelQuery = useLiveQuery((q) =>
		q.from({ch: channelsCollection}).where(({ch}) => eq(ch.slug, deck?.playlist_slug ?? ''))
	)
	let channel = $derived(channelQuery.data?.[0])

	let lastTrack = $state()
	let lastChannel = $state()
	$effect(() => {
		const currentTrack = track ?? broadcastTrack
		if (currentTrack) lastTrack = currentTrack
		else if (!deck?.playlist_track) lastTrack = undefined
	})
	$effect(() => {
		if (channel) lastChannel = channel
		else if (!deck?.playlist_track) lastChannel = undefined
	})

	let displayTrack = $derived(track ?? broadcastTrack ?? lastTrack)
	let displayChannel = $derived(channel ?? lastChannel)
	let broadcasterChannel = $derived.by(() => {
		const channelId = deck?.listening_to_channel_id
		if (!channelId) return undefined
		void channelsCollection.state.size
		return channelsCollection.state.get(channelId)
	})
	let headerChannel = $derived(
		deck?.listening_to_channel_id ? (broadcasterChannel ?? displayChannel) : displayChannel
	)
	let secondaryChannel = $derived.by(() => {
		if (!deck?.listening_to_channel_id || !headerChannel || !displayChannel) return undefined
		const same =
			(headerChannel.id && displayChannel.id && headerChannel.id === displayChannel.id) ||
			(headerChannel.slug && displayChannel.slug && headerChannel.slug === displayChannel.slug)
		return same ? undefined : displayChannel
	})
	const listenSlug = $derived(
		deck?.listening_to_channel_id
			? (channelsCollection.state.get(deck.listening_to_channel_id)?.slug ??
					broadcastsCollection.state.get(deck.listening_to_channel_id)?.channels?.slug)
			: undefined
	)
	const broadcastSlug = $derived(
		deck?.broadcasting_channel_id ? channelsCollection.state.get(deck.broadcasting_channel_id)?.slug : undefined
	)
	const autoUri = $derived(
		deck?.auto_radio && deck.playlist_slug
			? viewLabel(deck.view ?? {sources: [{channels: [deck.playlist_slug]}]}) ||
					`@${deck.playlist_slug}`
			: undefined
	)
	const modePresenceCount = $derived(
		deck?.listening_to_channel_id && listenSlug
			? (channelPresence[listenSlug]?.broadcast ?? 0)
			: deck?.broadcasting_channel_id && broadcastSlug
				? (channelPresence[broadcastSlug]?.broadcast ?? 0)
				: autoUri && deck?.playlist_slug
					? (channelPresence[deck.playlist_slug]?.byUri?.[autoUri] ?? 0)
					: 0
	)
	let canEditTrackChannel = $derived(Boolean(displayChannel?.id && canEditChannel(displayChannel.id)))
	let trackHref = $derived(
		!appState.embed_mode && displayTrack?.slug && displayTrack?.id
			? resolve('/[slug]/tracks/[tid]', {slug: displayTrack.slug, tid: String(displayTrack.id)})
			: undefined
	)
	let provider = $derived(
		displayTrack?.provider || (displayTrack?.url ? parseUrl(displayTrack.url)?.provider : null) || null
	)

	let activeQueue = $derived(getActiveQueue(deck))
	let canPlayFromQueue = $derived(canPlay(activeQueue, track?.id))
	let canPrevFromQueue = $derived(canPrev(activeQueue, track?.id))
	let canNextFromQueue = $derived(canNext(activeQueue, track?.id))

	let mediaDuration = $derived(deck?.media_duration ?? NaN)
	let mediaCurrentTime = $derived(deck?.media_current_time ?? 0)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
	class="deck-compact-bar"
	class:active-deck={isActiveDeck}
	onclick={(e) => {
		if (e.target instanceof Element && e.target.closest('a, button, input, menu')) return
		appState.active_deck_id = deckId
	}}
>
	{#if appState.show_track_range_control !== false && displayTrack}
		<PlayerProgress
			currentTime={mediaCurrentTime}
			{mediaDuration}
			trackDuration={displayTrack?.duration}
			disabled={Boolean(deck?.listening_to_channel_id || deck?.auto_radio)}
			onseek={(val) => {
				if (deck) deck.media_current_time = val
				const mediaElement = getMediaPlayer(deckId)
				if (mediaElement) mediaElement.currentTime = val
			}}
		/>
	{/if}
	<div class="header-info" class:active-track-bg={Boolean(displayTrack)}>
		{#if showEdgeControls && (!deck?.listening_to_channel_id || isListeningGroupControlDeck)}
			<button
				class="close-deck"
				onclick={() => {
					const bchId = getBroadcastingChannelId()
					clearUserInitiatedPlay(deckId)
					removeDeck(deckId)
					if (bchId) notifyBroadcastState(bchId)
				}}
				aria-label={m.player_tooltip_close_deck()}
				{@attach tooltip({content: m.player_tooltip_close_deck()})}
			>
				<Icon icon="close" />
			</button>
		{/if}
		<div class="channel-panel">
			{#if headerChannel}
				<ChannelMicroCard
					channel={headerChannel}
					href={appState.embed_mode ? undefined : resolve('/[slug]', {slug: headerChannel.slug})}
				/>
			{/if}
			{#if secondaryChannel}
				<ChannelMicroCard
					channel={secondaryChannel}
					href={appState.embed_mode ? undefined : resolve('/[slug]', {slug: secondaryChannel.slug})}
				/>
			{/if}
		</div>
		{#if displayTrack}
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="track-panel"
				onclick={(e) => {
					if (!trackHref) return
					if (e.target instanceof Element && e.target.closest('button, a')) return
					goto(trackHref)
				}}
			>
				<TrackCard
					track={displayTrack}
					{deckId}
					canEdit={canEditTrackChannel}
					menuAlign="end"
					menuValign="top"
				/>
			</div>
		{/if}
		<menu class="controls">
			{#if !deck?.listening_to_channel_id && !deck?.auto_radio && !deck?.broadcasting_channel_id}
				<button
					onclick={() => previous(deckId, 'user_prev')}
					aria-label={m.player_compact_prev()}
					disabled={!canPrevFromQueue}
				>
					<Icon icon="previous-fill" />
				</button>
				<button
					class="play"
					class:active={deck?.is_playing}
					onclick={() => togglePlayPause(deckId)}
					aria-label={m.player_compact_play_pause()}
					disabled={!canPlayFromQueue}
				>
					<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
				</button>
				<button
					onclick={() => next(deckId, 'user_next')}
					aria-label={m.player_compact_next()}
					disabled={!canNextFromQueue}
				>
					<Icon icon="next-fill" />
				</button>
				<SpeedControl {deckId} {provider} />
				<VolumeControl {deckId} />
			{:else if deck?.auto_radio}
				{@const autoNotSynced = !!deck?.auto_radio_drifted || !deck?.is_playing}
				<button
					class="play"
					class:active={deck?.is_playing}
					onclick={() => togglePlayPause(deckId)}
					aria-label={m.player_compact_play_pause()}
					disabled={!canPlayFromQueue}
				>
					<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
				</button>
				<button
					class="auto-sync"
					class:active={!autoNotSynced}
					title={autoNotSynced ? m.auto_radio_resync() : m.auto_radio_join()}
					aria-label={autoNotSynced ? m.auto_radio_resync() : m.auto_radio_join()}
					onclick={() => resyncAutoRadio(deckId)}
				>
					{#if modePresenceCount > 0}
						<PresenceCount count={modePresenceCount} />
					{/if}
					<Icon icon="infinite" size={12} />
				</button>
			{:else if !deck?.listening_to_channel_id}
				<VolumeControl {deckId} />
			{/if}
		</menu>
		{#if showEdgeControls && isListeningGroupControlDeck}
			<button
				class="expand"
				onclick={() => toggleDeckCompact(deckId)}
				aria-label={m.player_compact_show_panel()}
				{@attach tooltip({content: m.player_compact_show_panel()})}
			>
				<Icon icon="deck-panel" expanded />
			</button>
		{/if}
	</div>
</div>

<style>
	.deck-compact-bar {
		min-height: 49px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		border-top: 1px solid var(--gray-6);
		background: var(--color-interface-elevated);
		min-width: 0;
		overflow: hidden;
	}

	.deck-compact-bar :global(.progress) {
		flex: 1 0 100%;
		width: 100%;
		min-width: 0;
		padding-bottom: 0;
	}

	.header-info {
		display: flex;
		flex-direction: row;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.25rem;
		min-width: 0;
		flex: 1 1 auto;
		width: 100%;
		min-height: 2rem;
		padding-inline: 0.4rem;
		padding-block: 0.25rem;
	}

	.close-deck {
		order: 0;
		flex: 0 0 auto;
		align-self: center;
	}

	.channel-panel {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		row-gap: 0.2rem;
		min-width: 0;
		flex: 0 1 auto;
		order: 1;
	}

	:global(.channel-panel .channel-micro-card) {
		flex: 0 1 auto;
		max-width: 100%;
	}

	.active-deck :global(.channel-panel .channel-micro-card) {
		border-color: var(--accent-9);
	}

	.track-panel {
		min-width: 0;
		flex: 1 1 0;
		cursor: pointer;
		order: 3;
	}

	.controls {
		display: flex;
		align-items: center;
		flex-wrap: nowrap;
		gap: 0.25rem;
		flex: 0 0 auto;
		min-width: 0;
		order: 4;
	}

	.controls .auto-sync.active :global(svg) {
		color: var(--accent-9);
	}

	.expand {
		flex: 0 0 auto;
		align-self: center;
		order: 5;
	}

	.track-panel :global(article) {
		height: 100%;
		outline: 0;
		outline-offset: 0;
	}

	.track-panel :global(.card) {
		padding: 0;
	}

	.track-panel :global(h3 + p) {
		max-width: 100%;
	}

	@media (min-width: 601px) {
		.channel-panel {
			min-width: 8.5rem;
			flex: 0 1 18rem;
		}

		.controls {
			margin-left: auto;
		}

		.controls :global(.volume) {
			margin-left: 0;
		}
	}
</style>
