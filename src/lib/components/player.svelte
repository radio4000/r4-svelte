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
		togglePlay,
		toggleDeckCompact,
		togglePlayerExpanded,
		toggleQueuePanel,
		toggleShuffle,
		toggleVideoPlayer,
		getUserInitiatedPlay,
		setUserInitiatedPlay
	} from '$lib/api'
	import {leaveBroadcast, getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast.js'
	import {appState, canEditChannel, removeDeck} from '$lib/app-state.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {logger} from '$lib/logger'
	import {tracksCollection, channelsCollection, updateTrack} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	/** @type {{deckId: number, deckNumber?: number, deckCount?: number, children?: import('svelte').Snippet}} */
	let {deckId, deckNumber = 1, deckCount = 1, children} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)
	let showDeckNumber = $derived(deckCount > 1)

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()

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

	let src = $derived(track?.url)
	let mediaElement = $derived(track?.provider === 'youtube' ? youtubePlayer : soundcloudPlayer)

	/** @type {string[]} */
	let trackIds = $derived(deck?.playlist_tracks || [])

	/** @type {string[]} */
	let activeQueue = $derived(deck?.shuffle ? deck?.playlist_tracks_shuffled || [] : trackIds)

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
		mediaElement.muted = deck.volume === 0
	}

	function handleVolumeChange(e) {
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
		if (mediaElement) {
			applyInitialVolume()
		}
	})

	const mediaControllerId = $derived(`r5-deck-${deckId}`)
</script>

<div class="player">
	<!-- 1. Header: top bar + channel info row -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header class="header" onclick={() => (appState.active_deck_id = deckId)}>
		<div class="header-top">
			<div class="header-id" class:active={isActiveDeck}>
				<IconR4 />
				{#if showDeckNumber}
					<span class="deck-number" class:active={isActiveDeck}>{deckNumber}</span>
				{/if}
			</div>
			<menu class="deck-controls">
				<button
					onclick={() => toggleVideoPlayer(deckId)}
					class:active={deck?.show_video_player}
					aria-label={m.player_visible()}
					{@attach tooltip({content: m.player_visible(), position: 'top'})}
				>
					<Icon icon="video" />
				</button>
				{#if !isListeningToBroadcast}
					<button
						onclick={() => toggleQueuePanel(deckId)}
						class:active={deck?.queue_panel_visible}
						aria-label={m.queue_visible()}
						{@attach tooltip({content: m.queue_visible(), position: 'top'})}
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
				<button
					onclick={() => toggleDeckCompact(deckId)}
					{@attach tooltip({content: 'Minimize deck', position: 'top'})}
				>
					<Icon icon="sidebar-fill-right" />
				</button>
				{#if deckCount > 1}
					<button onclick={() => removeDeck(deckId)} {@attach tooltip({content: 'Close deck', position: 'top'})}>
						<Icon icon="delete" />
					</button>
				{/if}
			</menu>
		</div>
		{#if channel}
			<div class="header-info">
				<a href={resolve(`/${channel.slug}`)} class="avatar">
					<ChannelAvatar id={channel.image} alt={channel.name} />
				</a>
				{#if track}
					{@const ytid = !appState.hide_track_artwork && track.media_id ? track.media_id : null}
					{#if ytid}
						<img class="track-artwork" src="https://i.ytimg.com/vi/{ytid}/mqdefault.jpg" alt={track.title} />
					{/if}
				{/if}
				<div class="info">
					{#if track}
						{@const trackHref = resolve(`/${channel.slug}/tracks/${track.id}`)}
						<a href={trackHref}><strong>{track.title}</strong></a>
						{#if track.description}
							<small class="description">{track.description}</small>
						{/if}
					{:else}
						<strong><a href={resolve(`/${channel.slug}`)}>{channel.name}</a></strong>
					{/if}
				</div>
				{#if isListeningToBroadcast && broadcastingChannel}
					<span class="caps btn-leave">Live</span>
				{/if}
			</div>
		{/if}
	</header>

	<!-- 2. Video — always in DOM; deck.hide-video CSS hides visually -->
	<media-controller id={mediaControllerId} class="video" data-clickable="true">
		{#if track?.provider === 'youtube'}
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
		{:else if track?.provider === 'soundcloud'}
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
		{/if}
		<media-loading-indicator slot="centered-chrome"></media-loading-indicator>
	</media-controller>

	<!-- 3. Queue/history (injected by deck) -->
	{@render children?.()}

	<!-- 4. Controls -->
	<menu class="controls">
		<media-control-bar mediacontroller={mediaControllerId}>
			{#if isListeningToBroadcast}
				<button onclick={() => leaveBroadcast(deckId)} class="btn">
					{m.broadcasts_leave()}
				</button>
				<media-mute-button class="btn" {@attach tooltip({content: m.player_tooltip_mute(), position: 'top'})}
				></media-mute-button>
				<media-volume-range></media-volume-range>
			{:else}
				{@render btnShuffle()}
				{@render btnPrev()}
				{@render btnPlay()}
				{@render btnNext()}
				<media-mute-button class="btn" {@attach tooltip({content: m.player_tooltip_mute(), position: 'top'})}
				></media-mute-button>
				<media-volume-range></media-volume-range>
			{/if}
		</media-control-bar>
	</menu>
</div>

{#snippet btnPrev()}
	<button
		onclick={() => previous(deckId, track, activeQueue, 'user_prev')}
		class="prev"
		{@attach tooltip({content: m.player_tooltip_prev()})}
	>
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button
		onclick={() => next(deckId, track, activeQueue, 'user_next')}
		disabled={!canPlay}
		class="next"
		{@attach tooltip({content: m.player_tooltip_next()})}
	>
		<Icon icon="next-fill" />
	</button>
{/snippet}

{#snippet btnPlay()}
	<button
		onclick={() => togglePlay(mediaElement)}
		disabled={!canPlay}
		class="play"
		{@attach tooltip({content: deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()})}
	>
		<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
	</button>
{/snippet}

{#snippet btnShuffle()}
	<button
		onclick={(e) => {
			e.preventDefault()
			e.stopPropagation()
			toggleShuffle(deckId)
		}}
		class={['shuffle', {active: deck?.shuffle}]}
		{@attach tooltip({content: m.player_tooltip_shuffle()})}
	>
		<Icon icon="shuffle" />
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

	.header-id {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		color: var(--gray-9);
	}

	.header-id.active {
		color: var(--accent-9);
	}

	.deck-number {
		font-size: var(--font-2);
		font-weight: 700;
		color: var(--gray-9);
	}

	.deck-number.active {
		color: var(--accent-9);
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0 0.4rem 0.3rem;
	}

	.avatar {
		flex-shrink: 0;
		width: 2.5rem;

		:global(img) {
			border-radius: var(--media-radius);
		}
	}

	.track-artwork {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--media-radius);
		object-fit: cover;
		object-position: center;
		flex-shrink: 0;
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
	}

	.btn-leave {
		flex-shrink: 0;
		font-size: var(--font-2);
		margin-left: auto;
	}

	.deck-controls {
		display: flex;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.video {
		flex-shrink: 0;
		aspect-ratio: 16 / 9;
		width: 100%;
		max-height: 30dvh;
		background: black;
	}

	.controls {
		border-top: 1px solid var(--gray-6);
		flex-shrink: 0;
	}
</style>
