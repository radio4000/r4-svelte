<script>
	import {untrack} from 'svelte'
	import {resolve} from '$app/paths'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import 'media-chrome'
	import '$lib/youtube-video-custom-element.js'
	import '$lib/soundcloud-player-custom-element.js'
	import {
		next,
		play,
		previous,
		togglePlayPause,
		toggleDeckCompact,
		togglePlayerExpanded,
		toggleQueuePanel,
		toggleVideo,
		getUserInitiatedPlay,
		setUserInitiatedPlay,
		resyncAutoRadio,
		recordSeekPosition
	} from '$lib/api'
	import {getActiveQueue, canPlay, canPrev, canNext} from '$lib/player/queue'
	import {playbackState, toAutoTracks} from '$lib/player/auto-radio'
	import {
		joinBroadcast,
		leaveBroadcast,
		getBroadcastingChannelId,
		notifyBroadcastState
	} from '$lib/broadcast.js'
	import {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '$lib/player/broadcast-utils'
	import {appState, canEditChannel, removeDeck, deckAccent} from '$lib/app-state.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import DeckChannelHeader from '$lib/components/deck-channel-header.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {logger} from '$lib/logger'
	import {parseUrl} from 'media-now/parse-url'
	import {tracksCollection, updateTrack} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {eq} from '@tanstack/svelte-db'
	import {isDbId, trackImageUrl} from '$lib/utils'
	import PlayerProgress from '$lib/components/player-progress.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import * as m from '$lib/paraglide/messages'
	import {
		trackAutoRadioPresence,
		untrackAutoRadioPresence,
		trackBroadcastPresence,
		untrackBroadcastPresence,
		channelPresence
	} from '$lib/presence.svelte'
	import {viewLabel} from '$lib/views'
	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	/** @type {{deckId: number, children?: import('svelte').Snippet, scrollToActive?: (() => void) | undefined}} */
	let {deckId, children, scrollToActive} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)
	let hasMultipleDecks = $derived(Object.keys(appState.decks).length > 1)
	let deckIds = $derived(Object.keys(appState.decks).map(Number))
	let accentColor = $derived(deckAccent(deckIds, deckId))

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()
	let audioPlayer = $state()

	// Reactive track lookup - re-derive when playlist_track or collection changes
	let track = $derived.by(() => {
		const id = deck?.playlist_track
		if (!id) return undefined
		void tracksCollection.state.size // subscribe to collection changes
		return tracksCollection.state.get(id)
	})

	// Reactive channel lookup via live query — uses deck.playlist_slug (persisted signal)
	// so it works on reload before tracks are loaded
	const channelQuery = useLiveQuery((q) =>
		q.from({ch: channelsCollection}).where(({ch}) => eq(ch.slug, deck?.playlist_slug ?? ''))
	)
	let channel = $derived(channelQuery.data?.[0])
	let lastTrack = $state()
	let lastChannel = $state()
	$effect(() => {
		if (track) lastTrack = track
		else if (!deck?.playlist_track) lastTrack = undefined
	})
	$effect(() => {
		if (channel) lastChannel = channel
		else if (!deck?.playlist_track) lastChannel = undefined
	})
	let displayTrack = $derived(track ?? lastTrack)
	let displayChannel = $derived(channel ?? lastChannel)

	let src = $derived(track?.url)
	let provider = $derived(
		track?.provider || (track?.url ? parseUrl(track.url)?.provider : null) || null
	)
	let useNativeAudio = $derived(provider === 'file')
	let mediaElement = $derived.by(() => {
		if (provider === 'youtube') return youtubePlayer
		if (provider === 'soundcloud') return soundcloudPlayer
		if (useNativeAudio) return audioPlayer
		return undefined
	})
	let activeQueue = $derived(getActiveQueue(deck))
	let canPlayFromQueue = $derived(canPlay(activeQueue, track?.id))
	let canPrevFromQueue = $derived(canPrev(activeQueue, track?.id))
	let canNextFromQueue = $derived(canNext(activeQueue, track?.id))

	// Track list for drift detection — recomputes only when playlist order changes
	const syncAutoTracks = $derived.by(() =>
		toAutoTracks(
			/** @type {import('$lib/types').Track[]} */
			((deck?.playlist_tracks ?? []).map((id) => tracksCollection.state.get(id)).filter(Boolean))
		)
	)
	const syncTotalDuration = $derived(syncAutoTracks.reduce((sum, t) => sum + t.duration, 0))

	let didPlay = $state(false)
	let userHasPlayed = $state(false)
	const isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))

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

	// The channel that is broadcasting (the DJ), looked up by ID
	let broadcastingChannel = $derived.by(() => {
		const id = deck?.listening_to_channel_id
		if (!id) return undefined
		return untrack(() => channelsCollection.state.get(id))
	})
	let headerChannel = $derived(
		isListeningToBroadcast ? (broadcastingChannel ?? displayChannel) : displayChannel
	)

	const autoUri = $derived(
		deck?.auto_radio && deck.playlist_slug
			? viewLabel(deck.view ?? {sources: [{channels: [deck.playlist_slug]}]}) ||
					`@${deck.playlist_slug}`
			: undefined
	)
	const headerPresenceCount = $derived(
		deck?.listening_to_channel_id && listenSlug
			? (channelPresence[listenSlug]?.broadcast ?? 0)
			: deck?.broadcasting_channel_id && broadcastSlug
				? (channelPresence[broadcastSlug]?.broadcast ?? 0)
				: autoUri && deck?.playlist_slug
					? (channelPresence[deck.playlist_slug]?.byUri?.[autoUri] ?? 0)
					: 0
	)

	// Track previous track ID to detect changes for autoplay
	let prevTrackId = $state(/** @type {string|undefined} */ (undefined))

	$effect(() => {
		if (!track) return // Wait for data to load

		const trackChanged = track.id !== prevTrackId
		if (!trackChanged) return

		prevTrackId = track.id

		// Check if a user-initiated play flag was set
		if (getUserInitiatedPlay(deckId) && !userHasPlayed) {
			userHasPlayed = true
			setUserInitiatedPlay(deckId, false)
			log.log('Setting userHasPlayed=true for user-initiated track change')
		}

		// Auto-play if we were already playing when track changed
		if (didPlay) {
			log.log('Auto-playing next track')
			play(deckId).catch((error) => log.warn('Playback failed:', error))
		}
	})

	function handlePlay() {
		log.log('handlePlay', {
			mediaDuration: mediaElement?.duration,
			trackDuration: track?.duration,
			canEdit: channel ? canEditChannel(channel.id) : false
		})
		didPlay = true
		userHasPlayed = true
		if (deck) deck.is_playing = true
		if (deck && mediaElement && 'playbackRate' in mediaElement) {
			mediaElement.playbackRate = deck.speed ?? 1
		}
		if (mediaElement) recordSeekPosition(deckId, mediaElement.currentTime ?? 0)

		// Update track duration if missing (only for owned channels, once per track)
		if (
			track &&
			channel &&
			canEditChannel(channel.id) &&
			!track.duration &&
			mediaElement?.duration
		) {
			const duration = Math.round(mediaElement.duration)
			const existing = tracksCollection.state.get(track.id)
			if (duration > 0 && !existing?.duration) {
				updateTrack(channel, track.id, {duration})
			}
		}
	}

	function handlePause() {
		log.log('handlePause')
		if (deck) deck.is_playing = false
		if (mediaElement) recordSeekPosition(deckId, mediaElement.currentTime ?? 0)
	}

	/** @param {any} event */
	function handleError(event) {
		if (!event.target.error) {
			log.warn('Error event with no error object')
			return
		}
		const code = event.target.error.code
		const msg = `youtube_error_${code}`
		log.warn(msg)
		// Only write playback_error if user owns this track's channel
		const canWrite = canEditChannel(channel?.id)
		log.log('handleError', {trackId: track?.id, canWrite, channelId: channel?.id, msg})
		if (track?.id && channel && canWrite) {
			updateTrack(channel, track.id, {playback_error: msg})
				.then(() => log.log('playback_error saved', {id: track.id, msg}))
				.catch((e) => log.error('playback_error save failed', e))
		}
		next(deckId, 'youtube_error')
	}

	function handleEndTrack() {
		next(deckId, 'track_completed')
	}

	function applyInitialVolume() {
		if (!mediaElement || !deck) return
		mediaElement.volume = deck.volume
		mediaElement.muted = deck.muted ?? false
	}

	function handleVolumeChange(e) {
		// Providers can emit synthetic volumechange during initialization/load.
		// Keep deck volume authoritative and only sync trusted/user-originated changes.
		if (!e.isTrusted) return
		const {volume} = e.target
		if (!deck) return
		const muted = Boolean(e.target.muted)
		if (deck.volume === volume && deck.muted === muted) return
		deck.volume = volume
		// Don't persist muted=true when it's a side-effect of volume reaching 0
		if (volume > 0 || !muted) deck.muted = muted
		log.log('volumeChange', {volume, muted})
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}

	function handleSeeked() {
		if (!mediaElement) return
		recordSeekPosition(deckId, mediaElement.currentTime ?? 0)
	}

	$effect(() => {
		const el = mediaElement
		if (el) {
			untrack(() => applyInitialVolume())
		}
	})

	const mediaControllerId = $derived(`r5-deck-${deckId}`)

	// Track progress from the media element directly (bypasses media-chrome's
	// external mediacontroller association which doesn't work with Svelte 5).
	// Written to deck state so compact bar can read without its own listeners.
	let mediaDuration = $derived(deck?.media_duration ?? NaN)
	let mediaCurrentTime = $derived(deck?.media_current_time ?? 0)

	$effect(() => {
		const el = mediaElement
		if (!el) return
		const onTime = () => {
			if (deck) deck.media_current_time = el.currentTime ?? 0
		}
		const onDuration = () => {
			const d = el.duration
			if (deck) deck.media_duration = Number.isFinite(d) && d > 0 ? d : NaN
		}
		el.addEventListener('timeupdate', onTime)
		el.addEventListener('durationchange', onDuration)
		el.addEventListener('loadedmetadata', onDuration)
		// Seed initial values
		onTime()
		onDuration()
		return () => {
			el.removeEventListener('timeupdate', onTime)
			el.removeEventListener('durationchange', onDuration)
			el.removeEventListener('loadedmetadata', onDuration)
		}
	})

	// Apply speed to media element
	$effect(() => {
		const el = mediaElement
		const speed = deck?.speed ?? 1
		if (el && 'playbackRate' in el) {
			el.playbackRate = speed
		}
	})

	// Auto-radio drift — re-evaluates on every timeupdate (~250ms while playing)
	$effect(() => {
		if (!deck?.auto_radio || deck.auto_radio_rotation_start == null) return
		const t = mediaCurrentTime
		// Skip while the initial seek is still landing. joinAutoRadio/resyncAutoRadio
		// set auto_radio_drifted=false immediately; this guard prevents a false-positive
		// drifted flip before the media element has moved off 0.
		if (t < DRIFT_TOLERANCE_SECONDS) return
		const snap = playbackState(
			syncAutoTracks,
			syncTotalDuration,
			deck.auto_radio_rotation_start,
			Date.now()
		)
		const drifted =
			!snap ||
			deck.playlist_track !== snap.currentTrack.id ||
			Math.abs(t - snap.offsetSeconds) > DRIFT_TOLERANCE_SECONDS
		untrack(() => {
			if (deck) deck.auto_radio_drifted = drifted
		})
	})

	// Presence tracking — driven by what this deck is actively doing
	// Gated on user preference: undefined (not set) or true = share; false = don't share
	const sharePresence = $derived(appState.user?.user_metadata?.share_presence !== false)
	$effect(() => {
		if (!sharePresence) return
		const autoSlug = deck?.auto_radio ? deck.playlist_slug : undefined

		if (autoSlug) {
			untrack(() => trackAutoRadioPresence(autoSlug, deck.view))
			return () => untrackAutoRadioPresence(autoSlug)
		}
		if (listenSlug) {
			untrack(() => trackBroadcastPresence(listenSlug))
			return () => untrackBroadcastPresence(listenSlug)
		}
		if (broadcastSlug) {
			untrack(() => trackBroadcastPresence(broadcastSlug))
			return () => untrackBroadcastPresence(broadcastSlug)
		}
	})

	// Broadcast drift — O(1) arithmetic per tick
	$effect(() => {
		if (!deck?.listening_to_channel_id) return
		const t = mediaCurrentTime
		const tr = track
		if (!tr) return
		const expected = calculateSeekTime(deck, tr)
		if (expected == null) return
		const drifted = Math.abs(t - expected) > DRIFT_TOLERANCE_SECONDS
		untrack(() => {
			if (deck) deck.listening_drifted = drifted
		})
	})
</script>

<div class="player">
	<!-- 1. Top bar: logo + player controls -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header class="header" onclick={() => (appState.active_deck_id = deckId)}>
		<div class="header-top">
			{#if hasMultipleDecks}
				<div
					class="header-id"
					class:active={isActiveDeck}
					style:color={isActiveDeck ? accentColor : undefined}
				>
					<IconR4 />
				</div>
			{/if}
			{#if headerChannel}
				<div class="header-channel">
					{#if appState.embed_mode}
						<span class="avatar-link">
							<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
						</span>
					{:else}
						<a class="avatar-link" href={resolve(`/${headerChannel.slug}`)}>
							<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
						</a>
					{/if}
					<DeckChannelHeader
						{deck}
						channel={headerChannel}
						track={displayTrack}
						titleElement="div"
						titleClass="player-header-title"
						onAutoClick={() => resyncAutoRadio(deckId)}
						onBroadcastSyncClick={() => {
							if (deck?.listening_to_channel_id) joinBroadcast(deckId, deck.listening_to_channel_id)
						}}
						presenceCount={headerPresenceCount}
					/>
				</div>
			{/if}
			<menu class="layout-controls top-layout-controls">
				<button
					class="close-deck"
					onclick={() => {
						const bchId = getBroadcastingChannelId()
						removeDeck(deckId)
						if (bchId) notifyBroadcastState(bchId)
					}}
					{@attach tooltip({content: m.player_tooltip_close_deck(), position: 'top'})}
				>
					<Icon icon="close" />
				</button>
				<button
					onclick={() => toggleVideo(deckId)}
					class:active={deck?.hide_video_player}
					aria-label={deck?.hide_video_player ? m.player_hidden() : m.player_visible()}
					{@attach tooltip({
						content: deck?.hide_video_player ? m.player_hidden() : m.player_visible(),
						position: 'top'
					})}
				>
					<Icon icon="tv" />
				</button>
				{#if !isListeningToBroadcast}
					<button
						onclick={() => toggleQueuePanel(deckId)}
						class:active={deck?.hide_queue_panel}
						aria-label={deck?.hide_queue_panel ? m.queue_hidden() : m.queue_visible()}
						{@attach tooltip({
							content: deck?.hide_queue_panel ? m.queue_hidden() : m.queue_visible(),
							position: 'top'
						})}
					>
						<Icon icon="unordered-list" />
					</button>
				{/if}
				<button
					onclick={() => togglePlayerExpanded(deckId)}
					class:active={deck?.expanded}
					{@attach tooltip({content: m.player_tooltip_expand(), position: 'top'})}
				>
					<Icon icon="fullscreen" />
				</button>
				{#if hasMultipleDecks || !appState.embed_mode}
					<button
						onclick={() => toggleDeckCompact(deckId)}
						aria-label={m.player_tooltip_compact()}
						{@attach tooltip({content: m.player_tooltip_compact(), position: 'top'})}
					>
						<Icon icon="deck-panel" expanded />
					</button>
				{/if}
			</menu>
		</div>
	</header>

	<!-- 2. Media player -->
	<media-controller id={mediaControllerId} class="video" data-clickable="true">
		{#if provider === 'youtube'}
			<youtube-video
				slot="media"
				bind:this={youtubePlayer}
				{src}
				autoplay={userHasPlayed || undefined}
				onplay={handlePlay}
				onpause={handlePause}
				onseeked={handleSeeked}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></youtube-video>
		{:else if provider === 'soundcloud'}
			<soundcloud-player
				slot="media"
				bind:this={soundcloudPlayer}
				{src}
				autoplay={userHasPlayed || undefined}
				onplay={handlePlay}
				onpause={handlePause}
				onseeked={handleSeeked}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></soundcloud-player>
		{:else if track?.url}
			<audio
				slot="media"
				class="native-audio-player"
				bind:this={audioPlayer}
				{src}
				controls
				autoplay={userHasPlayed || undefined}
				preload="metadata"
				onplay={handlePlay}
				onpause={handlePause}
				onseeked={handleSeeked}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></audio>
		{/if}
		<media-loading-indicator slot="centered-chrome"></media-loading-indicator>
	</media-controller>

	<!-- 3. Queue/history (injected by deck) -->
	{@render children?.()}

	<section class="bottom-chrome">
		{#if appState.show_track_range_control !== false && displayTrack}
			<PlayerProgress
				currentTime={mediaCurrentTime}
				{mediaDuration}
				trackDuration={track?.duration}
				onseek={(val) => {
					if (deck) deck.media_current_time = val
					if (mediaElement) mediaElement.currentTime = val
				}}
			/>
		{/if}
		<!-- 4. Channel/track info + deck toggle -->
		<footer class="track-panel" onclick={() => (appState.active_deck_id = deckId)}>
			{#if isListeningToBroadcast && broadcastingChannel}
				<div class="header-info active-track-bg">
					{#if displayTrack && displayChannel}
						{@const ytid =
							!appState.hide_track_artwork && displayTrack.media_id ? displayTrack.media_id : null}
						{@const trackHref =
							!appState.embed_mode && isDbId(displayTrack.id)
								? resolve(`/${displayChannel.slug}/tracks/${displayTrack.id}`)
								: null}
						{#if ytid}
							{#if trackHref}
								<a href={trackHref} class="track-artwork"
									><img src={trackImageUrl(ytid)} alt={displayTrack.title} /></a
								>
							{:else}
								<span class="track-artwork"
									><img src={trackImageUrl(ytid)} alt={displayTrack.title} /></span
								>
							{/if}
						{/if}
						<div class="info">
							<h3 class="title">
								{#if trackHref}<a href={trackHref}>{displayTrack.title}</a
									>{:else}{displayTrack.title}{/if}
							</h3>
							<p class="description">{m.player_broadcast_live()}</p>
						</div>
					{:else}
						<div class="info">
							<strong>{m.player_broadcast_live()}</strong>
						</div>
					{/if}
					<span class="caps btn-leave">{m.status_live_short()}</span>
				</div>
			{:else if displayTrack}
				<TrackCard
					track={displayTrack}
					{deckId}
					canEdit={Boolean(channel && canEditChannel(channel.id))}
					menuValign="top"
					menuAlign="end"
					onLocate={scrollToActive}
				/>
			{/if}
		</footer>

		<menu class="controls">
			{#if isListeningToBroadcast}
				<button
					disabled
					class="play status"
					aria-label={deck?.is_playing ? m.player_broadcast_playing() : m.player_broadcast_paused()}
					title={deck?.is_playing ? m.player_broadcast_playing() : m.player_broadcast_paused()}
				>
					<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
				</button>
				<button onclick={() => leaveBroadcast(deckId)} class="btn">
					{m.broadcasts_leave()}
				</button>
			{:else}
				{@render btnPrev()}
				{@render btnPlay()}
				{@render btnNext()}
				<SpeedControl {deckId} {provider} />
			{/if}
			{#if !isListeningToBroadcast}
				<VolumeControl {deckId} />
			{/if}
		</menu>
	</section>
</div>

{#snippet btnPrev()}
	<button
		onclick={() => previous(deckId, 'user_prev')}
		disabled={!canPrevFromQueue}
		class="prev"
		{@attach tooltip({content: m.player_tooltip_prev()})}
	>
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button
		onclick={() => next(deckId, 'user_next')}
		disabled={!canNextFromQueue}
		class="next"
		{@attach tooltip({content: m.player_tooltip_next()})}
	>
		<Icon icon="next-fill" />
	</button>
{/snippet}

{#snippet btnPlay()}
	<button
		onclick={() => togglePlayPause(deckId)}
		disabled={!canPlayFromQueue}
		class="play"
		class:active={deck?.is_playing}
		{@attach tooltip({
			content: deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()
		})}
	>
		<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
	</button>
{/snippet}

<style>
	.player {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.header {
		display: flex;
		flex-direction: column;
		cursor: pointer;
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.5rem;
		gap: 0.4rem;
	}

	.header-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		max-width: min(58vw, 20rem);
	}

	.header-channel :global(.deck-channel-header) {
		flex: 1;
		min-width: 0;
	}

	.header-channel :global(.player-header-title) {
		font-size: var(--font-4);
		font-weight: 600;
		line-height: 1;
	}

	.header-channel :global(.meta-row) {
		font-size: var(--font-2);
	}

	.avatar-link {
		flex-shrink: 0;
		line-height: 0;

		:global(img) {
			height: 2rem;
		}
	}

	.header-id {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--gray-9);
	}

	.header-id.active {
		color: var(--accent-9);
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
	}

	.active-track-bg {
		background: var(--accent-2);
		border-radius: 4px;
	}

	.track-artwork {
		flex-shrink: 0;
		width: 2.5rem;
		height: 2.5rem;

		img {
			width: 100%;
			height: 100%;
			border-radius: var(--media-radius);
			object-fit: cover;
			object-position: center;
			display: block;
		}
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.3;
	}

	.info .title {
		font-size: var(--font-4);
		font-weight: 600;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.info .description {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--gray-9);
	}

	.info a {
		color: inherit;
		text-decoration: none;
	}

	.info a:visited {
		color: inherit;
	}

	.btn-leave {
		flex-shrink: 0;
		font-size: var(--font-2);
		margin-left: auto;
	}

	:global(.volume) {
		margin-left: auto;
	}

	.controls {
		align-items: center;
		min-width: 0;
		width: 100%;
		flex-shrink: 0;
		padding: 0.5rem;
	}

	.layout-controls {
		align-items: center;
		flex-shrink: 0;
	}

	.top-layout-controls {
		justify-content: flex-end;
		margin-left: auto;
	}

	.video {
		flex: 1 0 auto;
		width: 100%;
		max-height: 25dvh;
		background: black;
	}

	.video:not(:has(.native-audio-player)) {
		aspect-ratio: 16 / 9;
	}

	.native-audio-player {
		width: 100%;
	}

	.bottom-chrome {
		border-top: 1px solid var(--gray-7);
		margin-top: auto;
		display: flex;
		flex-direction: column;

		@media (max-width: 768px) {
			margin-top: 0;
		}
	}

	.bottom-chrome:has(.active) {
		border-top: 0;
	}

	.track-panel {
		flex-shrink: 0;
		cursor: pointer;
		background: var(--header-bg);
	}

	@media (max-width: 768px) {
		.controls {
			gap: 0.1rem;
			justify-content: flex-start;
		}
	}
</style>
