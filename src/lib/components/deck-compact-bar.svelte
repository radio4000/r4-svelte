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
	import {buildDeckChannelHeaderState} from '$lib/components/deck-channel-header-shared'
	import TrackCard from '$lib/components/track-card.svelte'
	import IconDeckPanel from '$lib/components/icon-deck-panel.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])

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
	let headerTitle = $derived(headerChannel?.name ?? (headerSlug ? `@${headerSlug}` : '@unknown'))
	let headerState = $derived.by(() =>
		buildDeckChannelHeaderState({
			title: headerTitle,
			slug: headerSlug,
			playlistTitle: deck?.playlist_title,
			listening: Boolean(deck?.listening_to_channel_id),
			listeningWhoSlug: broadcasterChannel?.slug,
			listeningWhomTrackSlug: displayTrack?.slug,
			listeningWhomFallbackSlug: deck?.playlist_slug ?? displaySlug,
			tagBaseSlug: broadcasterChannel?.slug ?? headerSlug,
			toHref: (path) => resolve(/** @type {any} */ (path))
		})
	)
	let canEditTrackChannel = $derived(Boolean(displayChannel?.id && canEditChannel(displayChannel.id)))
	let provider = $derived(
		displayTrack?.provider || (displayTrack?.url ? parseUrl(displayTrack.url)?.provider : null) || null
	)

	let activeQueue = $derived(getActiveQueue(deck))
	let canPlayFromQueue = $derived(canPlay(activeQueue, track?.id))
	let canPrevFromQueue = $derived(canPrev(activeQueue, track?.id))
	let canNextFromQueue = $derived(canNext(activeQueue, track?.id))

	let mediaDuration = $state(NaN)
	let mediaCurrentTime = $state(0)

	$effect(() => {
		const currentTrackId = deck?.playlist_track
		if (!currentTrackId) return
		let stopped = false
		let rafId = 0
		let cleanup = () => {}

		const bind = () => {
			if (stopped) return
			const el = getMediaPlayer(deckId)
			if (!el) {
				rafId = requestAnimationFrame(bind)
				return
			}
			const onTime = () => {
				mediaCurrentTime = el.currentTime ?? 0
			}
			const onDuration = () => {
				const d = el.duration
				mediaDuration = Number.isFinite(d) ? d : NaN
			}
			el.addEventListener('timeupdate', onTime)
			el.addEventListener('durationchange', onDuration)
			el.addEventListener('loadedmetadata', onDuration)
			onTime()
			onDuration()
			cleanup = () => {
				el.removeEventListener('timeupdate', onTime)
				el.removeEventListener('durationchange', onDuration)
				el.removeEventListener('loadedmetadata', onDuration)
			}
		}

		rafId = requestAnimationFrame(bind)
		return () => {
			stopped = true
			cancelAnimationFrame(rafId)
			cleanup()
		}
	})
</script>

<div class="deck-compact-bar">
	{#if appState.show_track_range_control !== false && displayTrack}
		<div class="progress">
			<input
				type="range"
				min="0"
				max={Number.isFinite(mediaDuration) ? mediaDuration : 0}
				step="any"
				value={mediaCurrentTime}
				oninput={(e) => {
					const val = Number(e.currentTarget.value)
					const mediaElement = getMediaPlayer(deckId)
					if (mediaElement) mediaElement.currentTime = val
				}}
				class="progress-range"
				disabled={!Number.isFinite(mediaDuration)}
			/>
		</div>
	{/if}
	<div class="header-info" class:active-track-bg={Boolean(displayTrack)}>
		{#if displayTrack}
			<div class="track-panel">
				<TrackCard track={displayTrack} {deckId} canEdit={canEditTrackChannel} menuAlign="end" menuValign="top" />
			</div>
		{/if}
		<div class="channel-panel">
			{#if headerChannel}
				<a class="avatar" href={headerState.slugHref}>
					<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
				</a>
			{/if}
			<div class="channel-info">
				<DeckChannelHeader
					title={headerState.title}
					titleHref={headerState.slugHref}
					slug={headerState.slug}
					slugHref={headerState.slugHref}
					isPlaying={Boolean(deck?.is_playing)}
					isBroadcasting={Boolean(deck?.broadcasting_channel_id)}
					tags={headerState.tags}
					showAutoButton={Boolean(deck?.auto_radio)}
					autoGhost={!deck?.auto_radio_drifted}
					autoTitle={deck?.auto_radio_drifted ? m.auto_radio_resync() : m.auto_radio_join()}
					onAutoClick={() => resyncAutoRadio(deckId)}
					listeningWhoSlug={deck?.listening_to_channel_id ? headerState.listeningWhoSlug : undefined}
					listeningWhoHref={deck?.listening_to_channel_id ? headerState.listeningWhoHref : undefined}
					listeningWhomSlug={deck?.listening_to_channel_id ? headerState.listeningWhomSlug : undefined}
					listeningWhomHref={deck?.listening_to_channel_id ? headerState.listeningWhomHref : undefined}
					showBroadcastSync={Boolean(deck?.listening_to_channel_id)}
					broadcastSyncDrifted={Boolean(deck?.listening_drifted)}
					broadcastSyncTitle={deck?.listening_drifted ? m.player_sync_broadcast() : m.player_broadcast_synced()}
					onBroadcastSyncClick={() =>
						deck?.listening_to_channel_id && joinBroadcast(deckId, deck.listening_to_channel_id)}
				/>
			</div>
		</div>
	</div>
	<div class="row-controls">
		<menu class="controls">
			<button
				onclick={() => previous(deckId, track, activeQueue, 'user_prev')}
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
				onclick={() => next(deckId, track, activeQueue, 'user_next')}
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
			<IconDeckPanel />
		</button>
	</div>
</div>

<style>
	.deck-compact-bar {
		min-height: 49px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.2rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		background: var(--header-bg);
		min-width: 0;
		overflow: hidden;
	}

	.row-controls {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 1 1 20rem;
		margin-left: 0;
		min-width: 0;
		order: 3;
		justify-content: flex-end;
	}

	.progress {
		order: 1;
		flex: 1 0 100%;
		width: 100%;
		min-width: 0;
	}

	.progress-range {
		width: 100%;
		height: 10px;
	}

	.controls {
		align-items: center;
		flex: 1;
	}

	.header-info {
		display: flex;
		align-items: stretch;
		gap: 0.5rem;
		min-width: 0;
		flex: 1 1 42rem;
		order: 2;
	}

	.channel-panel {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 14rem;
		flex: 0 1 24rem;
	}

	.avatar {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
	}

	.expand {
		flex-shrink: 0;
	}

	.channel-info {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1 1 auto;
		line-height: 1.2;
	}

	.track-panel {
		min-width: 0;
		flex: 1 1 24rem;
	}

	.track-panel :global(article) {
		height: 100%;
	}

	.track-panel :global(.card) {
		min-height: 0;
		padding: 0.25rem 0 0.25rem 0.5rem;
	}

	.track-panel :global(h3 + p) {
		max-width: 100%;
	}

	@media (max-width: 768px) {
		.deck-compact-bar {
			display: grid;
			grid-template-columns: 1fr;
			grid-template-areas:
				'progress'
				'info'
				'controls';
			row-gap: 0.2rem;
		}

		.progress {
			grid-area: progress;
			order: initial;
		}

		.header-info {
			grid-area: info;
			order: initial;
			flex: 1 1 auto;
			width: 100%;
			min-height: 2rem;
		}

		.row-controls {
			grid-area: controls;
			order: initial;
			margin-left: 0;
			flex: 1 1 100%;
			width: 100%;
			justify-content: flex-start;
			flex-wrap: wrap;
		}

		.progress :global(media-time-range) {
			--media-control-height: 8px;
		}
	}

	@media (max-width: 560px) {
		.channel-panel {
			min-width: 0;
		}

		.header-info {
			gap: 0.2rem;
			flex-direction: column;
		}

		.track-panel {
			width: 100%;
		}
	}
</style>
