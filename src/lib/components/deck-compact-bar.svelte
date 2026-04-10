<script>
	import {eq} from '@tanstack/svelte-db'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {togglePlayPause, next, previous, getMediaPlayer, resyncAutoRadio} from '$lib/api'
	import {resyncBroadcastDeck} from '$lib/broadcast'
	import {getActiveQueue, canPlay, canPrev, canNext} from '$lib/player/queue'
	import {parseUrl} from 'media-now/parse-url'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import PlayerProgress from '$lib/components/player-progress.svelte'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {isDbId} from '$lib/utils'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)

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

	const broadcastQuery = useLiveQuery((q) =>
		channel?.id
			? q
					.from({b: broadcastsCollection})
					.where(({b}) => eq(b.channel_id, channel.id))
					.findOne()
			: q
					.from({b: broadcastsCollection})
					.orderBy(({b}) => b.channel_id, 'asc')
					.limit(0)
	)
	let isChannelBroadcasting = $derived(Boolean(broadcastQuery.data))

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
	let displaySlug = $derived(displayChannel?.slug ?? displayTrack?.slug)
	let broadcasterChannel = $derived.by(() => {
		const channelId = deck?.listening_to_channel_id
		if (!channelId) return undefined
		void channelsCollection.state.size
		return channelsCollection.state.get(channelId)
	})
	let headerChannel = $derived(
		deck?.listening_to_channel_id ? (broadcasterChannel ?? displayChannel) : displayChannel
	)
	let headerSlug = $derived(headerChannel?.slug ?? displaySlug)
	let headerSlugHref = $derived(headerSlug ? `/${headerSlug}` : undefined)
	let canEditTrackChannel = $derived(
		Boolean(displayChannel?.id && canEditChannel(displayChannel.id))
	)
	let trackHref = $derived(
		!appState.embed_mode && displayTrack?.slug && displayTrack?.id && isDbId(displayTrack.id)
			? resolve(`/${displayTrack.slug}/tracks/${displayTrack.id}`)
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

	// Read media time from deck state (written by player.svelte)
	let mediaDuration = $derived(deck?.media_duration ?? NaN)
	let mediaCurrentTime = $derived(deck?.media_current_time ?? 0)
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
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
			onseek={(val) => {
				if (deck) deck.media_current_time = val
				const mediaElement = getMediaPlayer(deckId)
				if (mediaElement) mediaElement.currentTime = val
			}}
		/>
	{/if}
	<div class="header-info" class:active-track-bg={Boolean(displayTrack)}>
		<div class="channel-panel">
			{#if headerChannel}
				{#if appState.embed_mode}
					<span class="avatar">
						<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
					</span>
				{:else}
					<a class="avatar" href={headerSlugHref}>
						<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
					</a>
				{/if}
			{/if}
			<DeckChannelHeader
				{deck}
				channel={headerChannel}
				track={displayTrack}
				isBroadcastingChannel={isChannelBroadcasting}
				onAutoClick={() => resyncAutoRadio(deckId)}
				onBroadcastSyncClick={() => deck?.listening_to_channel_id && resyncBroadcastDeck(deckId)}
			/>
		</div>
		{#if displayTrack}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
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
		<button
			class="expand"
			onclick={() => (deck.compact = false)}
			aria-label={m.player_compact_show_panel()}
			{@attach tooltip({content: m.player_compact_show_panel()})}
		>
			<Icon icon="deck-panel" expanded />
		</button>
	</div>
	<div class="row-controls">
		{#if !deck?.listening_to_channel_id}
			<menu class="controls">
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
			</menu>
			<SpeedControl {deckId} {provider} />
			<VolumeControl {deckId} />
		{/if}
	</div>
</div>

<style>
	.deck-compact-bar {
		min-height: 49px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-bottom: 0.5rem;
		border-top: 1px solid var(--gray-6);
		background: var(--color-interface-elevated);
		min-width: 0;
		overflow: hidden;
	}

	.row-controls {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 1 1 100%;
		min-width: 0;
		width: 100%;
		justify-content: flex-start;
		flex-wrap: wrap;
	}

	.deck-compact-bar :global(.progress) {
		flex: 1 0 100%;
		width: 100%;
		min-width: 0;
		padding-bottom: 0;
	}

	.controls {
		align-items: center;
		flex: 0 0 auto;
	}

	.header-info {
		display: flex;
		flex-direction: row;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		min-width: 0;
		flex: 1 1 auto;
		width: 100%;
		min-height: 2rem;
	}

	.header-info,
	.row-controls {
		padding-inline: 0.5rem;
	}

	.channel-panel {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		width: 100%;
		flex: 1 1 100%;
	}

	.track-panel {
		min-width: 0;
		width: auto;
		flex: 1 1 0;
		cursor: pointer;
	}

	.avatar {
		width: var(--track-artwork-size);
		height: var(--track-artwork-size);
	}

	.active-deck .avatar {
		outline: 2px solid var(--accent-9);
		border-radius: var(--border-radius);
	}

	.expand {
		flex: 0 0 auto;
		align-self: center;
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
		.header-info {
			flex-wrap: nowrap;
			align-items: stretch;
		}

		.channel-panel {
			width: auto;
			min-width: 14rem;
			flex: 0 1 auto;
		}

		.track-panel {
			width: auto;
			flex: 1 1 auto;
		}
	}

	@media (min-width: 769px) {
		.deck-compact-bar {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
</style>
