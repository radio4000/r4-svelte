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
	let shouldResetFallbackState = $derived(
		!deck || (!deck.playlist_track && (deck.playlist_tracks?.length ?? 0) === 0)
	)
	$effect.pre(() => {
		const currentTrack = track ?? broadcastTrack
		if (currentTrack) lastTrack = currentTrack
		else if (shouldResetFallbackState) lastTrack = undefined
	})
	$effect.pre(() => {
		if (channel) lastChannel = channel
		else if (shouldResetFallbackState) lastChannel = undefined
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
		deck?.broadcasting_channel_id
			? channelsCollection.state.get(deck.broadcasting_channel_id)?.slug
			: undefined
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
	let canEditTrackChannel = $derived(
		Boolean(displayChannel?.id && canEditChannel(displayChannel.id))
	)
	let trackHref = $derived(
		!appState.embed_mode && displayTrack?.slug && displayTrack?.id
			? resolve('/[slug]/tracks/[tid]', {slug: displayTrack.slug, tid: String(displayTrack.id)})
			: undefined
	)
	let provider = $derived(
		displayTrack?.provider ||
			(displayTrack?.url ? parseUrl(displayTrack.url)?.provider : null) ||
			null
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
			isPlaying={Boolean(deck?.is_playing)}
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
			{#if !deck?.listening_to_channel_id && !deck?.auto_radio}
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
				{@const autoNotSynced = !!deck?.auto_radio_drifted}
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
					<Icon icon="infinite" size={12} />
					<span class="auto-sync-label">{autoNotSynced ? 'sync' : 'auto'}</span>
					<span class="live-circle" aria-hidden="true">◉</span>
					{#if modePresenceCount > 0}
						<span class="live-count">{modePresenceCount}</span>
					{/if}
				</button>
			{:else if !deck?.listening_to_channel_id}
				<VolumeControl {deckId} />
			{/if}
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
		</menu>
	</div>
</div>

<style>
	.deck-compact-bar {
		min-height: 49px;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		border-top: 1px solid var(--gray-6);
		min-width: 0;
		overflow: visible;
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
		flex-wrap: wrap;
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
		flex-wrap: nowrap;
		gap: 0.3rem;
		min-width: 0;
		flex: 0 0 auto;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
		order: 1;
		align-self: center;
	}

	.channel-panel::-webkit-scrollbar {
		display: none;
	}

	:global(.channel-panel .channel-micro-card) {
		flex: 0 0 auto;
		max-width: max-content;
		align-self: center;
		background: none;
		border: none;
	}

	.track-panel {
		min-width: 0;
		flex: 1 1 14rem;
		width: auto;
		max-width: none;
		cursor: pointer;
		order: 2;
	}

	.controls {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: nowrap;
		gap: 0.25rem;
		flex: 1 0 100%;
		width: 100%;
		min-width: 0;
		order: 3;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.controls::-webkit-scrollbar {
		display: none;
	}

	.controls .auto-sync.active :global(svg) {
		color: var(--accent-9);
	}

	.controls :global(.speed),
	.controls :global(.volume) {
		flex: 1 1 7rem;
		min-width: 0;
		max-width: none;
	}

	/* Force compact controls to be fully shrinkable despite component defaults */
	.controls :global(.speed .speed-btn) {
		min-width: 0;
	}

	.controls :global(.speed .range),
	.controls :global(.volume .range),
	.controls :global(.volume media-mute-button),
	.controls :global(.volume .btn) {
		min-width: 0;
	}

	.expand {
		flex: 0 0 auto;
		align-self: center;
		margin-left: auto;
		order: 3;
	}

	.track-panel :global(article) {
		height: 100%;
		outline: 0;
		outline-offset: 0;
	}

	.track-panel :global(article.active) {
		background: transparent;
	}

	.track-panel :global(.popover-menu) {
		flex: 0 0 auto;
	}

	.track-panel :global(.card) {
		padding: 0;
	}

	.track-panel :global(h3 + p) {
		max-width: 100%;
	}

	@media (max-width: 767px) {
		.header-info {
			padding-inline: 0.25rem;
			gap: 0.2rem;
			align-items: center;
		}

		.channel-panel {
			flex: 0 0 auto;
			order: 1;
			max-width: 100%;
		}

		:global(.channel-panel .channel-micro-card) {
			min-height: 1.35rem;
			padding: 0.08rem 0.25rem 0.08rem 0.08rem;
		}

		:global(.channel-panel .channel-micro-card .slug) {
			max-width: 8ch;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.track-panel {
			display: block;
			flex: 1 1 14rem;
			width: auto;
			max-width: none;
		}

		.controls {
			gap: 0.15rem;
			flex: 1 1 auto;
			width: 100%;
			flex-wrap: nowrap;
		}

		.controls .auto-sync {
			flex: 1 1 auto;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.3rem;
			overflow: hidden;
		}

		.controls .auto-sync .auto-sync-label {
			font-size: var(--font-1);
			white-space: nowrap;
		}

		.controls .auto-sync .live-circle {
			font-size: 0.55em;
			color: var(--accent-9);
		}

		.controls .auto-sync .live-count {
			font-size: var(--font-1);
			color: var(--gray-11);
		}

		.controls :global(.speed),
		.controls :global(.volume) {
			flex: 1 1 5rem;
			max-width: none;
		}

		.controls :global(.speed .speed-btn),
		.controls :global(.volume .btn),
		.controls :global(.volume media-mute-button) {
			min-width: 0;
			padding-inline: 0.25rem;
			font-size: var(--font-1);
		}

		.expand {
			align-self: center;
			margin-left: auto;
		}
	}

	@media (min-width: 768px) {
		.header-info {
			align-items: center;
			flex-wrap: nowrap;
		}

		.track-panel {
			order: 3;
			flex: 1 1 18rem;
			width: auto;
			max-width: none;
		}

		.controls {
			order: 4;
			flex: 0 1 auto;
			width: auto;
			overflow-x: visible;
		}

		.controls :global(.speed),
		.controls :global(.volume) {
			flex: 1 1 6.75rem;
		}

		.expand {
			order: 5;
		}
	}
</style>
