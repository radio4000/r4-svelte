<script>
	import {untrack} from 'svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import 'media-chrome'
	import '$lib/youtube-video-custom-element.js'
	import '$lib/soundcloud-player-custom-element.js'
	import {next, play, previous, togglePlay, togglePlayerExpanded, toggleQueuePanel, toggleShuffle} from '$lib/api'
	import {leaveBroadcast} from '$lib/broadcast.js'
	import {appState} from '$lib/app-state.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {logger} from '$lib/logger'
	import {tracksCollection, channelsCollection, updateTrack} from '$lib/tanstack/collections'
	import {detectMediaProvider} from '$lib/utils.ts'
	import * as m from '$lib/paraglide/messages'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()

	// Reactive track lookup - get from collection state
	// untrack the collection access to avoid state_unsafe_mutation during hydration
	let track = $derived.by(() => {
		const id = appState.playlist_track
		if (!id) return undefined
		return untrack(() => tracksCollection.state.get(id))
	})

	// Reactive channel lookup based on track
	let channel = $derived.by(() => {
		if (!track?.slug) return undefined
		return untrack(() => [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug))
	})

	let src = $derived(track?.url)
	let trackType = $derived(detectMediaProvider(src || ''))
	let mediaElement = $derived(trackType === 'youtube' ? youtubePlayer : soundcloudPlayer)

	/** @type {string[]} */
	let trackIds = $derived(appState.playlist_tracks || [])

	/** @type {string[]} */
	let activeQueue = $derived(appState.shuffle ? appState.playlist_tracks_shuffled || [] : trackIds)

	let didPlay = $state(false)
	let userHasPlayed = $state(false)
	const canPlay = $derived(Boolean(channel && track))
	// const autoplay = $derived(userHasPlayed ? 1 : 0)
	const isListeningToBroadcast = $derived(Boolean(appState.listening_to_channel_id))

	// The channel that is broadcasting (the DJ), looked up by ID
	let broadcastingChannel = $derived.by(() => {
		const id = appState.listening_to_channel_id
		if (!id) return undefined
		return untrack(() => channelsCollection.state.get(id))
	})

	/** @type {string} */
	let trackImage = $derived(track?.ytid ? `https://i.ytimg.com/vi/${track.ytid}/mqdefault.jpg` : '')

	// Track previous track ID to detect changes for autoplay
	let prevTrackId = $state(/** @type {string|undefined} */ (undefined))

	$effect(() => {
		if (!track) return // Wait for data to load

		const trackChanged = track.id !== prevTrackId
		if (!trackChanged) return

		prevTrackId = track.id

		// Check if a user-initiated play flag was set
		if (globalThis.__userInitiatedPlay && !userHasPlayed) {
			userHasPlayed = true
			globalThis.__userInitiatedPlay = false
			log.log('Setting userHasPlayed=true for user-initiated track change')
		}

		// Auto-play if we were already playing when track changed
		if (didPlay) {
			log.log('Auto-playing next track')
			play().catch((error) => log.warn('Playback failed:', error))
		}
	})

	function handlePlay() {
		log.log('handlePlay')
		didPlay = true
		userHasPlayed = true
		appState.is_playing = true

		// Update track duration if missing (only for owned channels)
		const canWrite = channel && appState.channels?.includes(channel.id)
		if (track && canWrite && !track.duration && mediaElement?.duration) {
			const duration = Math.round(mediaElement.duration)
			if (duration > 0) {
				updateTrack(channel, track.id, {duration})
			}
		}
	}

	function handlePause() {
		log.log('handlePause')
		appState.is_playing = false
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
		const canWrite = channel && appState.channels?.includes(channel.id)
		log.log('handleError', {trackId: track?.id, canWrite, channelId: channel?.id, msg})
		if (track?.id && canWrite) {
			updateTrack(channel, track.id, {playback_error: msg})
				.then(() => log.log('playback_error saved', {id: track.id, msg}))
				.catch((e) => log.error('playback_error save failed', e))
		}
		next(track, activeQueue, 'youtube_error')
	}

	function handleEndTrack() {
		next(track, activeQueue, 'track_completed')
	}

	function applyInitialVolume() {
		if (!mediaElement) return
		mediaElement.volume = appState.volume
		mediaElement.muted = appState.volume === 0
	}

	function handleVolumeChange(e) {
		const {volume} = e.target
		if (appState.volume === volume) return
		appState.volume = volume
		log.log('volumeChange', volume)
	}

	$effect(() => {
		if (mediaElement) {
			applyInitialVolume()
		}
	})
</script>

<div class={['player', appState.player_expanded ? 'expanded' : 'compact']}>
	{@render channelHeader()}

	{#if channel}
		{@render trackContent()}
	{/if}

	{#if !track}
		<p class="empty-state">
			<IconR4 />
		</p>
	{/if}

	<media-controller id="r5" data-clickable="true">
		{#if trackType === 'youtube'}
			<youtube-video
				slot="media"
				bind:this={youtubePlayer}
				{src}
				autoplay={userHasPlayed || undefined}
				onplay={handlePlay}
				onpause={handlePause}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></youtube-video>
		{:else if trackType === 'soundcloud'}
			<soundcloud-player
				slot="media"
				bind:this={soundcloudPlayer}
				{src}
				autoplay={userHasPlayed || undefined}
				onplay={handlePlay}
				onpause={handlePause}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></soundcloud-player>
		{/if}
		<media-loading-indicator slot="centered-chrome"></media-loading-indicator>
	</media-controller>

	<menu>
		<media-control-bar mediacontroller="r5">
			{#if !isListeningToBroadcast}
				{@render btnShuffle()}
				{@render btnPrev()}
				{@render btnPlay()}
				{@render btnNext()}
				<media-time-range></media-time-range>
				<media-time-display showduration></media-time-display>
			{/if}
			<media-mute-button class="btn" {@attach tooltip({content: m.player_tooltip_mute(), position: 'top'})}
			></media-mute-button>
			<media-volume-range></media-volume-range>
			{@render btnToggleQueuePanel()}
			{@render btnToggleExpanded()}
		</media-control-bar>
	</menu>

	{#if !isListeningToBroadcast}
		<media-control-bar class="timebar" mediacontroller="r5">
			<media-time-range></media-time-range>
			<media-time-display showduration></media-time-display>
		</media-control-bar>
	{/if}
</div>

{#snippet btnPrev()}
	<button
		onclick={() => previous(track, activeQueue, 'user_prev')}
		class="prev"
		{@attach tooltip({content: m.player_tooltip_prev()})}
	>
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button
		onclick={() => next(track, activeQueue, 'user_next')}
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
		{@attach tooltip({content: appState.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()})}
	>
		<Icon icon={appState.is_playing ? 'pause' : 'play-fill'} />
	</button>
{/snippet}

{#snippet btnShuffle()}
	<button
		onclick={(e) => {
			e.preventDefault()
			e.stopPropagation()
			toggleShuffle()
		}}
		class={['shuffle', {active: appState.shuffle}]}
		{@attach tooltip({content: m.player_tooltip_shuffle()})}
	>
		<Icon icon="shuffle" />
	</button>
{/snippet}

<!-- {#snippet btnEject()}
	<button onclick={() => eject()}>
		<Icon icon="eject" />
	</button>
{/snippet} -->

{#snippet btnToggleQueuePanel()}
	<button
		onclick={toggleQueuePanel}
		class:active={appState.queue_panel_visible}
		{@attach tooltip({content: m.player_tooltip_queue()})}
	>
		<Icon icon="sidebar-fill-right" size={20} />
	</button>
{/snippet}

{#snippet btnToggleExpanded()}
	<button
		onclick={() => togglePlayerExpanded()}
		class="expand"
		class:active={appState.player_expanded}
		{@attach tooltip({content: m.player_tooltip_expand(), position: 'top'})}
	>
		<Icon icon="fullscreen" />
	</button>
{/snippet}

{#snippet channelHeader()}
	{#if channel}
		{#if isListeningToBroadcast && broadcastingChannel}
			<header class="broadcast">
				<a href={`/${broadcastingChannel.slug}`}>
					<ChannelAvatar id={broadcastingChannel.image} alt={broadcastingChannel.name} />
				</a>
				<button onclick={leaveBroadcast} class="caps">Leave<br />broadcast</button>
			</header>
		{/if}

		<header class="channel">
			<a href={`/${channel.slug}`}>
				<ChannelAvatar id={channel.image} alt={channel.name} />
			</a>
			<h2><a href={`/${channel.slug}`}>{channel.name}</a></h2>
		</header>
	{/if}
{/snippet}

{#snippet trackContent()}
	{#if channel && track}
		{@const trackHref = `/${channel.slug}/tracks/${track.id}`}
		{#if !appState.hide_track_artwork}<a href={trackHref}><img class="artwork" src={trackImage} alt={track.title} /></a
			>{/if}
		<div class="text">
			<h3>
				{#if isListeningToBroadcast}
					<span class="broadcast-indicator">{m.player_live_indicator()}</span>
				{/if}
				<a href={trackHref}>{track.title}</a>
			</h3>
			{#if track.description}
				<p><small><LinkEntities text={track.description} slug={track.slug} /></small></p>
			{/if}
		</div>
	{/if}
{/snippet}

<style>
	.empty-state {
		margin: auto;
		opacity: 0.5;
		animation: rotate 60s linear infinite;
	}
	@keyframes rotate {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	.broadcast {
		display: flex;
		gap: 0.2rem;
		> a {
			width: 3rem;
		}
		margin-right: 0.4rem;
	}
</style>
