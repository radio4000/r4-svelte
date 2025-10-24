<script>
	import 'media-chrome'
	import '$lib/youtube-video-custom-element.js'
	import '$lib/soundcloud-player-custom-element.js'
	import {togglePlayerExpanded, toggleQueuePanel} from '$lib/api'
	import {next, play, previous, togglePlay, toggleShuffle} from '$lib/api/player'
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {logger} from '$lib/logger'
	import {channelsCollection, tracksCollection} from '$lib/collections'
	import {extractYouTubeId, detectMediaProvider} from '$lib/utils.ts'

	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	// Get app state
	const appState = useAppState()

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()

	/** @type {Track|undefined} */
	let track = $state()

	let src = $derived(track?.url)
	let trackType = $derived(detectMediaProvider(src))
	let mediaElement = $derived(trackType === 'youtube' ? youtubePlayer : soundcloudPlayer)

	/** @type {Channel|undefined} */
	let channel = $state()

	/** @type {string[]} */
	let trackIds = $derived(appState?.playlist_tracks || [])

	/** @type {string[]} */
	let activeQueue = $derived(appState?.shuffle ? appState.playlist_tracks_shuffled || [] : trackIds)

	let didPlay = $state(false)
	let userHasPlayed = $state(false)
	const canPlay = $derived(Boolean(channel && track))
	// const autoplay = $derived(userHasPlayed ? 1 : 0)
	const isListeningToBroadcast = $derived(Boolean(appState?.listening_to_channel_id))

	/** @type {string} */
	let trackImage = $derived.by(() => {
		if (!track?.url) return ''
		const ytid = extractYouTubeId(track.url)
		return ytid ? `https://i.ytimg.com/vi/${ytid}/mqdefault.jpg` : '' // default, mqdefault, hqdefault, sddefault, maxresdefault
	})

	$effect(async () => {
		const tid = appState?.playlist_track
		const trackChanged = tid && tid !== track?.id

		if (!trackChanged) {
			log.debug('same track. @todo maybe call play unless user did not play already?', tid, track?.id)
			return
		}

		await setChannelFromTrack(tid)

		// Check if a user-initiated play flag was set
		if (globalThis.__userInitiatedPlay && !userHasPlayed) {
			userHasPlayed = true
			globalThis.__userInitiatedPlay = false
			log.log('Setting userHasPlayed=true for user-initiated track change')
		}

		// Auto-play if we were already playing when track changed
		if (didPlay) {
			log.log('Auto-playing next track')
			try {
				await play()
			} catch (error) {
				log.warn('Playback failed:', error)
			}
		}
	})

	/** @param {string} tid */
	async function setChannelFromTrack(tid) {
		if (!tid || tid === track?.id) return

		track = tracksCollection.get(tid)
		if (!track) throw new Error(`Track not found: ${tid}`)

		channel = channelsCollection.toArray.find((c) => c.slug === track.channel_slug)
	}

	function handlePlay() {
		log.log('handlePlay')
		didPlay = true
		userHasPlayed = true
		appStateCollection.update(1, (draft) => {
			draft.is_playing = true
		})
	}

	function handlePause() {
		log.log('handlePause')
		appStateCollection.update(1, (draft) => {
			draft.is_playing = false
		})
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
		next(track, activeQueue, msg)
	}

	function handleEndTrack() {
		next(track, activeQueue, 'track_completed')
	}

	function applyInitialVolume() {
		if (!mediaElement) return
		mediaElement.volume = appState?.volume ?? 0.7
		mediaElement.muted = appState?.volume === 0
	}

	function handleVolumeChange(e) {
		const {volume} = e.target
		if (appState?.volume === volume) return
		appStateCollection.update(1, (draft) => {
			draft.volume = volume
		})
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

	{#if !channel}
		<p style="margin-left: 0.5rem">Find some sweet music</p>
	{/if}

	{#if channel}
		{@render trackContent()}
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
			{@render btnShuffle()}
			{@render btnPrev()}
			<!-- <media-play-button class="btn"></media-play-button> -->
			{@render btnPlay()}
			{@render btnNext()}
			<media-time-range></media-time-range>
			<media-time-display showduration></media-time-display>
			<media-mute-button class="btn"></media-mute-button>
			<media-volume-range></media-volume-range>
			{@render btnToggleQueuePanel()}
			{@render btnToggleExpanded()}
		</media-control-bar>
	</menu>

	<media-control-bar class="timebar" mediacontroller="r5">
		<media-time-range></media-time-range>
		<media-time-display showduration></media-time-display>
	</media-control-bar>
</div>

{#snippet btnPrev()}
	<button onclick={() => previous(track, activeQueue, 'user_prev')} class="prev">
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button onclick={() => next(track, activeQueue, 'user_next')} disabled={!canPlay} class="next">
		<Icon icon="next-fill" />
	</button>
{/snippet}

{#snippet btnPlay()}
	<button onclick={() => togglePlay(mediaElement)} disabled={!canPlay} class="play">
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
		{@attach tooltip({content: 'Toggle queue panel'})}
	>
		<Icon icon="sidebar-fill-right" size={20} />
	</button>
{/snippet}

{#snippet btnToggleExpanded()}
	<button
		onclick={() => togglePlayerExpanded()}
		class="expand"
		{@attach tooltip({content: 'Toggle expanded player', position: 'top'})}
	>
		<Icon icon="fullscreen" />
		<!-- <Icon icon="video" /> -->
	</button>
{/snippet}

{#snippet channelHeader()}
	{#if channel}
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
		{#if !appState.hide_track_artwork}<img class="artwork" src={trackImage} alt={track.title} />{/if}
		<div class="text">
			<h3>
				{#if isListeningToBroadcast}
					<span class="broadcast-indicator">🔴 LIVE</span>
				{/if}
				<a href={`/${channel.slug}/tracks/${track.id}`}>{track.title}</a>
			</h3>
			{#if track.description}
				<p><small><LinkEntities text={track.description} slug={track.channel_slug} /></small></p>
			{/if}
		</div>
	{/if}
{/snippet}
