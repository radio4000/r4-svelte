<script>
	import {resolve} from '$app/paths'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection} from '$lib/collections/channels'
	import {tracksCollection} from '$lib/collections/tracks'
	import {togglePlayPause, next, previous, getMediaPlayer, resyncAutoRadio} from '$lib/api'
	import {joinBroadcast} from '$lib/broadcast'
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

	let channel = $derived.by(() => {
		const slugToUse = track?.slug ?? deck?.playlist_slug
		if (!slugToUse) return undefined
		return [...channelsCollection.state.values()].find((ch) => ch.slug === slugToUse)
	})

	let lastTrack = $state()
	let lastChannel = $state()
	$effect(() => {
		if (track) lastTrack = track
	})
	$effect(() => {
		if (channel) lastChannel = channel
	})

	let displayTrack = $derived(track ?? lastTrack)
	let displayChannel = $derived(channel ?? lastChannel)
	let displaySlug = $derived(displayChannel?.slug ?? displayTrack?.slug)
	let broadcasterChannel = $derived.by(() => {
		const channelId = deck?.listening_to_channel_id
		if (!channelId) return undefined
		void channelsCollection.state.size
		return channelsCollection.state.get(channelId)
	})
	let headerChannel = $derived(deck?.listening_to_channel_id ? broadcasterChannel : displayChannel)
	let headerSlug = $derived(headerChannel?.slug ?? displaySlug)
	let headerSlugHref = $derived(headerSlug ? `/${headerSlug}` : undefined)
	let canEditTrackChannel = $derived(
		Boolean(displayChannel?.id && canEditChannel(displayChannel.id))
	)
	let trackHref = $derived(
		!appState.embed_mode && displayTrack?.slug && displayTrack?.id
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
			trackDuration={track?.duration}
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
				autoTitle={deck?.auto_radio_drifted ? m.auto_radio_resync() : m.auto_radio_join()}
				onAutoClick={() => resyncAutoRadio(deckId)}
				broadcastSyncTitle={deck?.listening_drifted
					? m.player_sync_broadcast()
					: m.player_broadcast_synced()}
				onBroadcastSyncClick={() =>
					deck?.listening_to_channel_id && joinBroadcast(deckId, deck.listening_to_channel_id)}
			/>
		</div>
		{#if displayTrack}
			<div class="track-panel">
				{#if trackHref}
					<a class="track-link" href={trackHref}>
						<TrackCard
							track={displayTrack}
							{deckId}
							canEdit={canEditTrackChannel}
							menuAlign="end"
							menuValign="top"
						/>
					</a>
				{:else}
					<TrackCard
						track={displayTrack}
						{deckId}
						canEdit={canEditTrackChannel}
						menuAlign="end"
						menuValign="top"
					/>
				{/if}
			</div>
		{/if}
	</div>
	<div class="row-controls">
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
		<button
			class="expand"
			onclick={() => (deck.compact = false)}
			aria-label={m.player_compact_show_panel()}
			{@attach tooltip({content: m.player_compact_show_panel()})}
		>
			<Icon icon="deck-panel" />
		</button>
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
		background: color-mix(in srgb, var(--deck-accent, var(--header-bg)) 8%, var(--header-bg));
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
		align-items: stretch;
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
		flex: 1;
	}

	.track-panel {
		min-width: 0;
		width: 100%;
		flex: 2;
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
		flex-shrink: 0;
	}

	.track-link {
		display: contents;
		text-decoration: none;
		color: inherit;
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
			width: auto;
			min-width: 14rem;
		}

		.track-panel {
			width: auto;
		}
	}

	@media (min-width: 769px) {
		.deck-compact-bar {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
</style>
