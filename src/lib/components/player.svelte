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
		toggleVideoPlayer,
		getUserInitiatedPlay,
		setUserInitiatedPlay
	} from '$lib/api'
	import {queuePrev} from '$lib/player/queue'
	import {leaveBroadcast, getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast.js'
	import {appState, canEditChannel, removeDeck} from '$lib/app-state.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {logger} from '$lib/logger'
	import {inferPlayerProvider} from '$lib/media'
	import {tracksCollection, channelsCollection, updateTrack} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	/** @type {{deckId: number, deckNumber?: number, deckCount?: number, children?: import('svelte').Snippet}} */
	let {deckId, deckNumber = 1, deckCount = 1, children} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()
	let audioPlayer = $state()

	// Reactive track lookup - get from collection state
	// untrack the collection access to avoid state_unsafe_mutation during hydration
	let track = $derived.by(() => {
		const id = deck?.playlist_track
		if (!id) return undefined
		return untrack(() => tracksCollection.state.get(id))
	})

	// Reactive channel lookup based on track
	let channel = $derived.by(() => {
		if (!track?.slug) return undefined
		return untrack(() => [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug))
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

	let src = $derived(track?.url)
	let provider = $derived(inferPlayerProvider(track?.provider, track?.url))
	let useNativeAudio = $derived(provider === 'audio')
	let mediaElement = $derived.by(() => {
		if (provider === 'youtube') return youtubePlayer
		if (provider === 'soundcloud') return soundcloudPlayer
		if (useNativeAudio) return audioPlayer
		return undefined
	})
	let supportsPlaybackSpeed = $derived(
		provider !== 'soundcloud' && Boolean(mediaElement && 'playbackRate' in mediaElement)
	)
	let speedMin = $derived(useNativeAudio ? 0.25 : 0.25)
	let speedMax = $derived(useNativeAudio ? 3 : 2)
	let speedStep = $derived(useNativeAudio ? 0.01 : 0.25)

	/** @type {string[]} */
	let trackIds = $derived(deck?.playlist_tracks || [])

	/** @type {string[]} */
	let activeQueue = $derived(deck?.shuffle ? deck?.playlist_tracks_shuffled || [] : trackIds)
	let hasTrackInQueue = $derived(Boolean(track?.id && activeQueue.includes(track.id)))
	let canPlayFromQueue = $derived(Boolean(activeQueue.length && hasTrackInQueue))
	let canPrevFromQueue = $derived(Boolean(track?.id && queuePrev(activeQueue, track.id)))
	let canNextFromQueue = $derived(Boolean(activeQueue.length > 1 && hasTrackInQueue))

	let didPlay = $state(false)
	let userHasPlayed = $state(false)
	const canPlay = $derived(Boolean(channel && track))
	const isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))

	// The channel that is broadcasting (the DJ), looked up by ID
	let broadcastingChannel = $derived.by(() => {
		const id = deck?.listening_to_channel_id
		if (!id) return undefined
		return untrack(() => channelsCollection.state.get(id))
	})
	let headerChannel = $derived(isListeningToBroadcast ? broadcastingChannel : displayChannel)

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
		log.log('handlePlay')
		didPlay = true
		userHasPlayed = true
		if (deck) deck.is_playing = true
		if (deck && mediaElement && 'playbackRate' in mediaElement) {
			mediaElement.playbackRate = deck.speed ?? 1
		}
		if (deck && mediaElement) {
			deck.seeked_at = new Date().toISOString()
			deck.seek_position = mediaElement.currentTime ?? 0
		}
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)

		// Update track duration if missing (only for owned channels)
		if (track && channel && canEditChannel(channel.id) && !track.duration && mediaElement?.duration) {
			const duration = Math.round(mediaElement.duration)
			if (duration > 0) {
				updateTrack(channel, track.id, {duration})
			}
		}
	}

	function handlePause() {
		log.log('handlePause')
		if (deck) deck.is_playing = false
		if (deck && mediaElement) {
			deck.seeked_at = new Date().toISOString()
			deck.seek_position = mediaElement.currentTime ?? 0
		}
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
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
		next(deckId, track, activeQueue, 'youtube_error')
	}

	function handleEndTrack() {
		next(deckId, track, activeQueue, 'track_completed')
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
		deck.muted = muted
		log.log('volumeChange', {volume, muted})
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}

	function handleSeeked() {
		if (!deck || !mediaElement) return
		deck.seeked_at = new Date().toISOString()
		deck.seek_position = mediaElement.currentTime ?? 0
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
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
	let mediaDuration = $state(NaN)
	let mediaCurrentTime = $state(0)

	$effect(() => {
		const el = mediaElement
		if (!el) return
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

	function handleSpeedChange(speed) {
		if (!deck) return
		deck.speed = speed
		if (mediaElement && 'playbackRate' in mediaElement) {
			mediaElement.playbackRate = speed
		}
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}

	function handleToggleMute() {
		if (!deck || !mediaElement) return
		const nextMuted = !(mediaElement.muted ?? deck.muted ?? false)
		mediaElement.muted = nextMuted
		deck.muted = nextMuted
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}
</script>

<div class="player">
	<!-- 1. Top bar: logo + player controls -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header class="header" onclick={() => (appState.active_deck_id = deckId)}>
		<div class="header-top">
			<div class="header-id" class:active={isActiveDeck}>
				<IconR4 />
			</div>
			{#if headerChannel}
				<a class="header-channel" href={resolve(`/${headerChannel.slug}`)}>
					<ChannelAvatar id={headerChannel.image} alt={headerChannel.name} />
					<span class="header-channel-text">
						<strong class="active-track-title">{headerChannel.name}</strong>
						{#if deck?.playlist_title}
							<small class="deck-title">{deck.playlist_title}</small>
						{/if}
					</span>
				</a>
			{/if}
			<menu class="layout-controls top-layout-controls">
				<button
					onclick={() => {
						removeDeck(deckId)
						const bchId = getBroadcastingChannelId()
						if (bchId) notifyBroadcastState(bchId)
					}}
					{@attach tooltip({content: 'Close deck', position: 'top'})}
				>
					<Icon icon="close" />
				</button>
				<button
					onclick={() => toggleVideoPlayer(deckId)}
					class:active={deck?.hide_video_player}
					aria-label={deck?.hide_video_player ? m.player_visible() : m.player_hidden()}
					{@attach tooltip({
						content: deck?.hide_video_player ? m.player_visible() : m.player_hidden(),
						position: 'top'
					})}
				>
					<Icon icon="tv" />
				</button>
				{#if !isListeningToBroadcast}
					<button
						onclick={() => toggleQueuePanel(deckId)}
						class:active={deck?.hide_queue_panel}
						aria-label={deck?.hide_queue_panel ? m.queue_visible() : m.queue_hidden()}
						{@attach tooltip({content: deck?.hide_queue_panel ? m.queue_visible() : m.queue_hidden(), position: 'top'})}
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
			<div class="progress-row">
				<input
					type="range"
					min="0"
					max={Number.isFinite(mediaDuration) ? mediaDuration : 0}
					step="any"
					value={mediaCurrentTime}
					oninput={(e) => {
						const val = Number(e.currentTarget.value)
						if (mediaElement) mediaElement.currentTime = val
						if (deck) {
							deck.seeked_at = new Date().toISOString()
							deck.seek_position = val
						}
						const broadcastingChannelId = getBroadcastingChannelId()
						if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
					}}
					class="progress-range"
					disabled={!Number.isFinite(mediaDuration)}
				/>
			</div>
		{/if}

		<!-- 4. Channel/track info + deck toggle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<footer class="header-footer" onclick={() => (appState.active_deck_id = deckId)}>
			{#if isListeningToBroadcast && broadcastingChannel}
				<div class="header-info active-track-bg">
					{#if displayTrack && displayChannel}
						{@const ytid = !appState.hide_track_artwork && displayTrack.media_id ? displayTrack.media_id : null}
						{@const trackHref = resolve(`/${displayChannel.slug}/tracks/${displayTrack.id}`)}
						{#if ytid}
							<a href={trackHref} class="track-artwork"
								><img src="https://i.ytimg.com/vi/{ytid}/mqdefault.jpg" alt={displayTrack.title} /></a
							>
						{/if}
						<div class="info">
							<a href={trackHref} class="active-track-title"><strong>{displayTrack.title}</strong></a>
							<small class="description">Live broadcast</small>
						</div>
					{:else}
						<div class="info">
							<strong>Live broadcast</strong>
						</div>
					{/if}
					<span class="caps btn-leave">Live</span>
				</div>
			{:else if displayChannel}
				{#if displayTrack}
					{@const ytid = !appState.hide_track_artwork && displayTrack.media_id ? displayTrack.media_id : null}
					{@const trackHref = resolve(`/${displayChannel.slug}/tracks/${displayTrack.id}`)}
					<div class="header-info active-track-bg">
						{#if ytid}
							<a href={trackHref} class="track-artwork"
								><img src="https://i.ytimg.com/vi/{ytid}/mqdefault.jpg" alt={displayTrack.title} /></a
							>
						{/if}
						<div class="info">
							<a href={trackHref} class="active-track-title"><strong>{displayTrack.title}</strong></a>
							{#if displayTrack.description}
								<small class="description">{displayTrack.description}</small>
							{/if}
						</div>
					</div>
				{/if}
			{/if}
		</footer>

		<menu class="player-controls bottom-controls">
			{#if isListeningToBroadcast}
				<button
					disabled
					class="play status"
					aria-label={deck?.is_playing ? 'Broadcast is playing' : 'Broadcast is paused'}
					title={deck?.is_playing ? 'Broadcast is playing' : 'Broadcast is paused'}
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
				{#if appState.show_speed_control && supportsPlaybackSpeed}
					<div class="speed">
						<button
							class="speed-btn"
							class:active={deck?.speed != null && deck.speed !== 1}
							onclick={() => handleSpeedChange(1)}
							{@attach tooltip({content: 'Reset speed', position: 'top'})}
						>
							{Number(deck?.speed ?? 1).toFixed(2)}x
						</button>
						<input
							type="range"
							min={speedMin}
							max={speedMax}
							step={speedStep}
							value={deck?.speed ?? 1}
							oninput={(e) => handleSpeedChange(Number(e.currentTarget.value))}
							class="speed-range"
							data-default={!deck?.speed || deck.speed === 1 || null}
						/>
					</div>
				{/if}
			{/if}
			<div class="volume">
				<media-mute-button
					class="btn"
					class:active={Boolean(deck?.muted)}
					onclick={handleToggleMute}
					{@attach tooltip({content: m.player_tooltip_mute(), position: 'top'})}
				></media-mute-button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={deck?.volume ?? 1}
					oninput={(e) => {
						const val = Number(e.currentTarget.value)
						if (deck) deck.volume = val
						if (mediaElement) mediaElement.volume = val
						const broadcastingChannelId = getBroadcastingChannelId()
						if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
					}}
					class="volume-range"
					data-muted={deck?.muted || deck?.volume === 0 || null}
				/>
			</div>
			<button onclick={() => toggleDeckCompact(deckId)} aria-label="Minimize deck">
				<Icon icon="sidebar-fill-right" />
			</button>
		</menu>
	</section>
</div>

{#snippet btnPrev()}
	<button
		onclick={() => previous(deckId, track, activeQueue, 'user_prev')}
		disabled={!canPrevFromQueue}
		class="prev"
		{@attach tooltip({content: m.player_tooltip_prev()})}
	>
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button
		onclick={() => next(deckId, track, activeQueue, 'user_next')}
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
		{@attach tooltip({content: deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()})}
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
		padding: 0.3rem 0.4rem;
		gap: 0.4rem;
	}

	.header-channel {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
		max-width: min(58vw, 14rem);
		text-decoration: none;
		color: inherit;
	}

	.header-channel-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.header-channel :global(img) {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--media-radius);
	}

	.header-channel .active-track-title {
		width: fit-content;
		max-width: 100%;
	}

	.header-channel strong {
		font-size: var(--font-4);
		font-weight: 600;
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.deck-title {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--font-2);
		color: var(--gray-9);
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
		padding: 0.3rem 0.6rem;
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

		strong,
		small,
		a {
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		a {
			color: inherit;
			text-decoration: none;
		}
	}

	.description {
		color: var(--gray-9);
		font-size: var(--font-3);
	}

	.active-track-title {
		display: inline-flex;
		max-width: 100%;
		background: var(--accent-9);
		color: var(--gray-1);
		padding-inline: var(--space-1);
		border-radius: 2px;
		text-decoration: none;
	}

	.active-track-title:visited {
		color: var(--gray-1);
	}

	.active-track-title strong {
		color: inherit;
		font-size: var(--font-4);
		font-weight: 600;
	}

	.info a.active-track-title,
	.info a.active-track-title:visited {
		color: var(--gray-1);
	}

	.btn-leave {
		flex-shrink: 0;
		font-size: var(--font-2);
		margin-left: auto;
	}

	.speed {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex: 1;
		min-width: 0;
	}

	.speed-btn {
		font-size: var(--font-1);
		min-width: 2.5em;
		text-align: center;
		flex-shrink: 0;
	}

	.speed-range {
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
		cursor: pointer;
		accent-color: var(--gray-7);
	}

	.speed-range:not([data-default]) {
		accent-color: var(--accent-9);
	}

	.player-controls {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		justify-content: flex-end;
		min-width: 0;
	}

	.bottom-controls {
		width: 100%;
		flex-shrink: 0;
		padding: 0.45rem 0.6rem;
		border-top: 1px solid var(--gray-6);
	}

	.layout-controls {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.top-layout-controls {
		justify-content: flex-end;
		margin-left: auto;
		padding: 0;
	}

	.video {
		flex: 1 0 auto;
		aspect-ratio: 16 / 9;
		width: 100%;
		max-height: 25dvh;
		background: black;
	}

	.native-audio-player {
		width: 100%;
	}

	.bottom-chrome {
		margin-top: auto;
		display: flex;
		flex-direction: column;
	}

	.progress-row {
		padding: 0 0.45rem 0.08rem;
		line-height: 0;
	}

	.progress-range {
		width: 100%;
		height: 10px;
		cursor: pointer;
		accent-color: var(--accent-9);
	}

	.progress-range:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.header-footer {
		flex-shrink: 0;
		cursor: pointer;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		background: var(--header-bg);
		margin: 0 0.4rem 0.6rem;
	}

	.volume {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex: 1;
		min-width: 0;
	}

	.volume-range {
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
		cursor: pointer;
		accent-color: var(--accent-9);
	}

	.volume-range[data-muted] {
		accent-color: var(--gray-7);
	}

	@media (max-width: 768px) {
		.bottom-controls {
			gap: 0.1rem;
			justify-content: flex-start;
		}

		.bottom-controls .volume {
			flex: 1.6;
		}

		.bottom-controls .volume-range {
			min-width: 8rem;
		}
	}
</style>
