<script>
	import {onMount, untrack} from 'svelte'
	import {resolve} from '$app/paths'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import {
		next,
		play,
		previous,
		togglePlayPause,
		toggleDeckCompact,
		getUserInitiatedPlay,
		setUserInitiatedPlay,
		resyncAutoRadio,
		leaveAutoRadio,
		rejoinAutoRadio,
		recordSeekPosition,
		toggleShuffle
	} from '$lib/api'
	import {requestPlaybackWakeLock, releasePlaybackWakeLock} from '$lib/wake-lock'
	import {getActiveQueue, canPlay, canPrev, canNext} from '$lib/player/queue'
	import {sortedListeningDeckIds, sortedDeckIds, isGroupControlDeck} from '$lib/deck'
	import {playbackState, toAutoTracks, AUTO_RADIO_SYNC_GRACE_MS} from '$lib/player/auto-radio'
	import {getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast.js'
	import {calculateSeekTime, DRIFT_TOLERANCE_SECONDS} from '$lib/broadcast-utils'
	import {createDeckDisplay} from '$lib/player/deck-display.svelte'
	import {createMediaSession} from '$lib/player/media-session.svelte'
	import {createStallRecovery} from '$lib/player/stall-recovery.svelte'
	import {appState, canEditChannel, deckAccent} from '$lib/app-state.svelte'
	import ChannelMicroCard from '$lib/components/channel-micro-card.svelte'
	import Icon from '$lib/components/icon.svelte'
	import AutoRadioButton from '$lib/components/auto-radio-button.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import DeckMenu from '$lib/components/deck-menu.svelte'
	import SpeedControl from '$lib/components/speed-control.svelte'
	import VolumeControl from '$lib/components/volume-control.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {shortcutHint} from '$lib/keyboard'
	import {logger} from '$lib/logger'
	import {parseUrl} from 'media-now/parse-url'
	import {tracksCollection, updateTrack} from '$lib/collections/tracks'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import {isDbId, extractHashtags, HASH_PREFIX_REGEX, isMobileViewport} from '$lib/utils'
	import PlayerProgress from '$lib/components/player-progress.svelte'
	import Tag from '$lib/components/tag.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import * as m from '$lib/paraglide/messages'
	import {
		trackAutoRadioPresence,
		untrackAutoRadioPresence,
		trackBroadcastPresence,
		untrackBroadcastPresence
	} from '$lib/presence.svelte'
	/** @typedef {import('$lib/types').Track} Track */
	/** @typedef {import('$lib/types').Channel} Channel */

	const log = logger.ns('player').seal()

	// Lazy: these define custom elements at module scope, which needs `HTMLElement`.
	onMount(async () => {
		await Promise.all([
			import('media-chrome'),
			import('$lib/youtube-video-custom-element.js'),
			import('$lib/soundcloud-player-custom-element.js')
		])
	})

	/** @type {{deckId: number, deckEl?: HTMLElement, children?: import('svelte').Snippet, scrollToActive?: (() => void) | undefined}} */
	let {deckId, deckEl, children, scrollToActive} = $props()

	let deck = $derived(appState.decks[deckId])
	let isActiveDeck = $derived(appState.active_deck_id === deckId)
	let hasMultipleDecks = $derived(Object.keys(appState.decks).length > 1)
	let listeningDeckIds = $derived(sortedListeningDeckIds(appState.decks))
	let isListeningGroupControlDeck = $derived(isGroupControlDeck(deck, deckId, listeningDeckIds))
	let hasListeningMultiDeck = $derived(listeningDeckIds.length > 1)
	let deckIds = $derived(sortedDeckIds(appState.decks))
	let accentColor = $derived(deckAccent(deckIds, deckId))

	// Both media player elements
	let youtubePlayer = $state()
	let soundcloudPlayer = $state()
	let audioPlayer = $state()

	// deckId never changes for this component instance — it's rendered inside
	// an {#each ... (deckId)} keyed block, so a changed deckId remounts it.
	const display = createDeckDisplay(untrack(() => deckId))
	const track = $derived(display.track)
	const channel = $derived(display.channel)
	const displayTrack = $derived(display.displayTrack)
	const displayChannel = $derived(display.displayChannel)

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

	// Lock-screen/notification controls and background-stall recovery. Pure
	// stability workarounds — quarantined in their own modules, see docs/player.md.
	const mediaSession = createMediaSession(
		untrack(() => deckId),
		{
			get mediaElement() {
				return mediaElement
			},
			get provider() {
				return provider
			},
			get displayTrack() {
				return displayTrack
			},
			get displayChannel() {
				return displayChannel
			},
			get canPrev() {
				return canPrevFromQueue
			},
			get canNext() {
				return canNextFromQueue
			}
		}
	)
	createStallRecovery(
		untrack(() => deckId),
		{
			get mediaElement() {
				return mediaElement
			},
			restoreVolume: applyInitialVolume
		}
	)

	// Track list for drift detection. Resolve each id via O(1) Map lookups on the
	// collection; a direct-collection live query is the reactive bridge (reading
	// its `data` re-runs this on any track change) without building a d2ts inArray
	// pipeline over the whole playlist. See docs/tanstack.md.
	const tracksLive = useLiveQuery(tracksCollection)
	const syncAutoTracks = $derived.by(() => {
		void tracksLive.data.length
		const state = tracksCollection.state
		return toAutoTracks(
			/** @type {import('$lib/types').Track[]} */
			((deck?.playlist_tracks ?? []).map((id) => state.get(id)).filter(Boolean))
		)
	})
	const syncTotalDuration = $derived(syncAutoTracks.reduce((sum, t) => sum + t.duration, 0))

	let deckMenu = $state(/** @type {{close: () => void} | undefined} */ (undefined))

	let didPlay = $state(false)
	let userHasPlayed = $state(false)
	const isListeningToBroadcast = $derived(Boolean(deck?.listening_to_channel_id))
	const isSyncedListeningMode = $derived(Boolean(isListeningToBroadcast || deck?.auto_radio))
	let showDeckActions = $derived(!isListeningToBroadcast || isListeningGroupControlDeck)

	const listenSlug = $derived(display.listenSlug)
	const broadcastSlug = $derived(display.broadcastSlug)

	const broadcastingChannel = $derived(display.broadcasterChannel)
	const headerChannel = $derived(display.headerChannel)
	const secondaryHeaderChannel = $derived(display.secondaryHeaderChannel)

	const headerTags = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local dedupe, not reactive state
		const tags = new Set(
			extractHashtags(deck?.playlist_title ?? '').map((tag) =>
				tag.replace(HASH_PREFIX_REGEX, '').toLowerCase()
			)
		)
		for (const source of deck?.view?.sources ?? []) {
			for (const tag of source?.tags ?? []) tags.add(tag.toLowerCase())
		}
		return Array.from(tags, (value) => ({
			value: `#${value}`,
			href: deck?.playlist_slug
				? `/${deck.playlist_slug}/tracks?tags=${encodeURIComponent(value)}`
				: undefined
		}))
	})

	const headerPresenceCount = $derived(display.presenceCount)

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
		// Re-assert right when real playback starts — this is exactly the moment
		// YouTube's iframe is most likely to claim the Media Session for itself.
		mediaSession.reassert()

		// Update track duration if missing (only for owned channels, once per track)
		if (
			track &&
			isDbId(track.id) &&
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

	/** A flagged track that plays again clears its own flag; owner only, like handleError. */
	function handlePlaying() {
		const id = track?.id
		if (!id || !isDbId(id) || !channel || !canEditChannel(channel.id)) return
		if (!tracksCollection.state.get(id)?.playback_error) return
		updateTrack(channel, id, {playback_error: null}).catch((e) =>
			log.error('playback_error clear failed', e)
		)
	}

	function handlePause() {
		log.log('handlePause')
		if (deck) deck.is_playing = false
		if (mediaElement) recordSeekPosition(deckId, mediaElement.currentTime ?? 0)
	}

	/** @param {any} event */
	function handleError(event) {
		const error = event.target.error
		if (error == null) {
			log.warn('Error event with no error object')
			return
		}
		const code = typeof error === 'number' ? error : error.code
		let msg = ''
		// Persist durable failures only: YouTube bad id, missing/private, or embed blocked.
		if (provider === 'youtube' && [2, 100, 101, 150].includes(code)) msg = `youtube:${code}`
		else if (provider === 'soundcloud' && code != null) msg = `soundcloud:${code}`
		log.warn('Playback error', {provider, code, trackId: track?.id})
		const id = track?.id
		if (msg && id && isDbId(id) && channel && canEditChannel(channel.id)) {
			updateTrack(channel, id, {playback_error: msg})
				.then(() => log.log('playback_error saved', {id, msg}))
				.catch((e) => log.error('playback_error save failed', e))
		}
		next(deckId, 'youtube_error')
	}

	function handleEndTrack() {
		if (deck?.listening_to_channel_id) return
		next(deckId, 'track_completed')
	}

	function applyInitialVolume() {
		if (!mediaElement || !deck) return
		mediaElement.volume = deck.volume
		mediaElement.muted = deck.muted ?? false
	}

	function handleVolumeChange(e) {
		// YouTube/SoundCloud wrappers dispatch synthetic volumechange events.
		// Accept those when they originate from the active media element.
		const fromProviderElement = e?.target && e.target === mediaElement
		if (!e.isTrusted && !fromProviderElement) return
		const {volume} = e.target
		if (!Number.isFinite(volume)) return
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
		if (deck?.video_mix && !isListeningToBroadcast) deck.video_mix = false
		if (hasListeningMultiDeck) return
		for (const id of listeningDeckIds) {
			const listeningDeck = appState.decks[id]
			if (listeningDeck?.video_mix) listeningDeck.video_mix = false
		}
	})

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

	// Clear stale duration when track changes so the previous track's duration doesn't show
	$effect(() => {
		void deck?.playlist_track
		if (deck) {
			deck.media_duration = NaN
			deck.media_current_time = 0
		}
	})

	$effect(() => {
		const trackId = deck?.playlist_track
		if (!trackId) return
		const el = mediaElement
		if (!el) return
		let prevTime = el.currentTime ?? 0
		const onTime = () => {
			if (!deck || deck.playlist_track !== trackId) return
			const currentTime = el.currentTime ?? 0
			const delta = currentTime - prevTime
			if (delta > 0 && delta < 3) {
				deck.ms_listened = (deck.ms_listened ?? 0) + delta * 1000
			}
			prevTime = currentTime
			deck.media_current_time = currentTime
		}
		const onDuration = () => {
			if (!deck || deck.playlist_track !== trackId) return
			const d = el.duration
			deck.media_duration = Number.isFinite(d) && d > 0 ? d : NaN
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

	// Wake lock — keep the screen on while this deck is playing. Ref-counted across
	// decks in the module itself, so multiple simultaneously-playing decks don't
	// release each other's lock.
	$effect(() => {
		if (!deck?.is_playing) return
		requestPlaybackWakeLock(deckId)
		return () => releasePlaybackWakeLock(deckId)
	})

	// Auto-radio drift — re-evaluates on every timeupdate (~250ms while playing)
	$effect(() => {
		if (!deck?.auto_radio || deck.auto_radio_rotation_start == null) return
		const t = mediaCurrentTime
		// Skip while the join/resync seek is still landing. joinAutoRadio/resyncAutoRadio
		// set auto_radio_drifted=false immediately, but the seek settles asynchronously —
		// evaluating in between flags a false positive on the very next timeupdate.
		if (Date.now() - (deck.auto_radio_synced_at ?? 0) < AUTO_RADIO_SYNC_GRACE_MS) return
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

<div
	class="player"
	class:video-mix={Boolean(deck?.video_mix && isListeningToBroadcast && hasListeningMultiDeck)}
>
	<!-- 1. Top bar: logo + player controls -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header
		class="header"
		onclick={(e) => {
			appState.active_deck_id = deckId
			// Mobile: the expanded deck covers the whole screen, so navigating to the
			// channel's route via this link would otherwise happen invisibly behind it.
			// Collapse to the compact bar so the route change is actually visible.
			if (
				isMobileViewport() &&
				e.target instanceof Element &&
				e.target.closest('.channel-micro-card')
			) {
				toggleDeckCompact(deckId)
			}
		}}
	>
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
					{@render headerChannelCard(headerChannel)}
					{#if secondaryHeaderChannel}
						{@render headerChannelCard(secondaryHeaderChannel)}
					{/if}
					{#each headerTags as tag (tag.value)}
						<Tag href={tag.href} value={tag.value} {deckId}>{tag.value}</Tag>
					{/each}
				</div>
			{/if}
			<menu class="layout-controls top-layout-controls">
				{#if showDeckActions}
					<PopoverMenu align="right" closeOnClick={false} bind:this={deckMenu}>
						{#snippet trigger()}
							<Icon icon="options-horizontal" />
						{/snippet}
						<DeckMenu
							{deckId}
							{deckEl}
							autoRadioAvailable={display.autoRadioAvailable}
							closeMenu={() => deckMenu?.close()}
						/>
					</PopoverMenu>
				{/if}
				{#if showDeckActions && (hasMultipleDecks || !appState.embed_mode)}
					<button
						class="compact-toggle"
						onclick={() => toggleDeckCompact(deckId)}
						aria-label={m.player_tooltip_compact()}
						{@attach tooltip({
							content: m.player_tooltip_compact() + shortcutHint('toggleCompactDeck'),
							position: 'top'
						})}
					>
						<Icon icon="deck-panel" />
					</button>
				{/if}
				{#if deck?.expanded}
					<button
						class="minimize"
						onclick={() => toggleDeckCompact(deckId)}
						aria-label={m.player_tooltip_compact()}
						{@attach tooltip({
							content: m.player_tooltip_compact() + shortcutHint('toggleCompactDeck'),
							position: 'top'
						})}
					>
						<Icon icon="arrow-down" />
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
				onplaying={handlePlaying}
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
				onplaying={handlePlaying}
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
				onplaying={handlePlaying}
				onpause={handlePause}
				onseeked={handleSeeked}
				onended={handleEndTrack}
				onerror={handleError}
				onvolumechange={handleVolumeChange}
			></audio>
		{/if}
		<media-loading-indicator slot="centered-chrome"></media-loading-indicator>
	</media-controller>
	{#if deck?.hide_video_player}
		<div class="video video-hidden-placeholder" aria-label="Radio4000" data-clickable="true">
			<IconR4 />
		</div>
	{/if}

	<!-- 3. Queue/history (injected by deck) -->
	{@render children?.()}

	<section class="bottom-chrome">
		{#if appState.show_track_range_control !== false && displayTrack}
			<PlayerProgress
				currentTime={mediaCurrentTime}
				{mediaDuration}
				trackDuration={track?.duration}
				isPlaying={Boolean(deck?.is_playing)}
				disabled={isListeningToBroadcast}
				onseek={(val) => {
					if (deck) deck.media_current_time = val
					if (mediaElement) mediaElement.currentTime = val
				}}
			/>
		{/if}

		<!-- 4. Channel/track info + mode info -->
		<footer
			class="track-panel"
			class:active-track={Boolean(displayTrack) && !(isListeningToBroadcast && broadcastingChannel)}
			onclick={() => (appState.active_deck_id = deckId)}
		>
			{#if isListeningToBroadcast && broadcastingChannel}
				{#if displayTrack}
					<div class="listening-track-panel active-track-bg">
						<TrackCard
							track={displayTrack}
							{deckId}
							canEdit={Boolean(displayChannel && canEditChannel(displayChannel.id))}
							disableDoubleClickPlay={true}
							linkTitleToTrack={true}
							menuValign="top"
							menuAlign="end"
						/>
					</div>
				{/if}
			{:else if displayTrack}
				<TrackCard
					track={displayTrack}
					{deckId}
					canEdit={Boolean(channel && canEditChannel(channel.id))}
					menuValign="top"
					menuAlign="end"
					onLocate={isSyncedListeningMode ? undefined : scrollToActive}
					disableDoubleClickPlay={isSyncedListeningMode}
					linkTitleToTrack={isSyncedListeningMode}
				/>
			{/if}
		</footer>

		{#if !isListeningToBroadcast || deck?.auto_radio}
			{#if !isListeningToBroadcast && !deck?.auto_radio}
				<SpeedControl {deckId} {provider} />
			{/if}
			<menu class="controls">
				{#if !isListeningToBroadcast && !deck?.auto_radio}
					{@render btnPrev()}
					{@render btnPlay()}
					{@render btnNext()}
					<VolumeControl {deckId} />
					{#if activeQueue.length > 2}
						<button
							onclick={() => toggleShuffle(deckId)}
							class:active={deck?.shuffle}
							class="shuffle"
							{@attach tooltip({
								content: m.player_tooltip_shuffle() + shortcutHint('toggleShuffle')
							})}
						>
							<Icon icon="shuffle" />
						</button>
					{/if}
					{#if display.autoRadioAvailable}
						<AutoRadioButton size={14} onclick={() => rejoinAutoRadio(deckId)} />
					{/if}
				{:else if deck?.auto_radio}
					{@render btnPlay()}
					<VolumeControl {deckId} />
					<AutoRadioButton
						live
						drifted={!!deck?.auto_radio_drifted}
						size={14}
						count={headerPresenceCount}
						onclick={() =>
							deck?.auto_radio_drifted ? resyncAutoRadio(deckId) : leaveAutoRadio(deckId)}
					/>
				{/if}
			</menu>
		{/if}
	</section>
</div>

{#snippet headerChannelCard(/** @type {Channel} */ ch)}
	<ChannelMicroCard
		channel={ch}
		href={appState.embed_mode ? undefined : resolve('/[slug]', {slug: ch.slug})}
	/>
{/snippet}

{#snippet btnPrev()}
	<button
		onclick={() => previous(deckId, 'user_prev')}
		disabled={!canPrevFromQueue}
		class="prev"
		{@attach tooltip({content: m.player_tooltip_prev() + shortcutHint('previousTrack')})}
	>
		<Icon icon="previous-fill" />
	</button>
{/snippet}

{#snippet btnNext()}
	<button
		onclick={() => next(deckId, 'user_next')}
		disabled={!canNextFromQueue}
		class="next"
		{@attach tooltip({content: m.player_tooltip_next() + shortcutHint('nextTrack')})}
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
			content:
				(deck?.is_playing ? m.player_tooltip_pause() : m.player_tooltip_play()) +
				shortcutHint('togglePlayPause')
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
		cursor: var(--interactive-cursor, pointer);
	}

	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.5rem;
		gap: 0.5rem;
	}

	/* Mobile-only "close the fullscreen sheet" affordance */
	.minimize {
		display: none;
	}

	@media (max-width: 768px) {
		.minimize {
			display: flex;
			align-items: center;
		}

		/* .minimize takes over collapsing on mobile fullscreen — hide the duplicate */
		:global(.deck.expanded) .compact-toggle {
			display: none;
		}
	}

	.header-channel {
		display: flex;
		flex-direction: row;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		row-gap: var(--space-1);
		min-width: 0;
		max-width: min(64vw, 26rem);
		/* Tags here are em-sized off the ambient font, which was the root
		   size — much bigger than the same tags render elsewhere (e.g.
		   deck-channel-header's meta-row). Match channel-micro-card's own
		   font-2 so everything in this row reads at one consistent scale. */
		font-size: var(--font-2);
	}

	.header-channel :global(.channel-micro-card) {
		flex: 0 1 auto;
		max-width: 100%;
		background: none;
		border: none;
	}

	.header-id {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--gray-9);
	}

	.header-id.active {
		color: var(--accent-9);
	}

	.active-track-bg {
		background: var(--accent-2);
		border-radius: 4px;
	}

	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
		min-width: 0;
		width: 100%;
		flex-shrink: 0;
		padding: 0.5rem;

		/* Volume's own flex-grow already fills whatever space prev/play/next
		   don't need — that alone pushes shuffle/auto (following it) to the
		   right, so it always grows and pushes the other buttons to the sides. */

		/* Mobile: transport centered; speed/volume shrink to content instead of
		   growing to fill the row, but keep their sliders — DJing with multiple
		   decks needs per-deck volume, same as it needs speed. */
		@media (max-width: 768px) {
			justify-content: center;

			:global(.speed),
			:global(.volume) {
				flex: 0 0 auto;
			}
		}
	}

	.controls :global(.auto-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding-inline: var(--space-1);
		min-height: 1.35rem;
	}

	/* Speed lives above .controls as its own full-width row, snug under the
	   track. Its own `flex: 1 1 6rem` is meant for sitting in a *row*
	   (.controls) — as a direct child of .bottom-chrome's column layout, that
	   basis applies to height instead of width, forcing a tall box. Reset it
	   to size from content. */
	.bottom-chrome > :global(.speed) {
		flex: 0 0 auto;
		padding: 0.25rem 0.5rem;
	}

	:global(.bottom-chrome > .speed + .controls) {
		padding-top: 0;
	}

	.layout-controls {
		align-items: center;
		flex-shrink: 0;
	}

	.top-layout-controls {
		justify-content: flex-end;
		margin-left: auto;
	}

	.top-layout-controls :global(.popover-menu > button.active) {
		color: var(--accent-9);
	}

	.video {
		flex: 1 0 auto;
		width: 100%;
		max-height: 25dvh;
		background: black;
		opacity: 1;
		transition:
			flex var(--duration-2) var(--ease-out),
			max-height var(--duration-2) var(--ease-out),
			width var(--duration-2) var(--ease-out),
			height var(--duration-2) var(--ease-out),
			opacity var(--duration-2) var(--ease-out);
	}

	.video:not(:has(.native-audio-player)) {
		aspect-ratio: 16 / 9;
	}

	/* Ensure custom media elements always fill the media-controller box. */
	.video :global(youtube-video),
	.video :global(soundcloud-player) {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	/* YouTube API may set explicit iframe dimensions; force it to fill its container. */
	.video :global(youtube-video iframe) {
		width: 100% !important;
		height: 100% !important;
		max-height: none !important;
	}

	/* Listening/auto decks should let media fill available deck height. */
	:global(.deck.listening) .video,
	:global(.deck.auto) .video {
		display: block;
		height: 100%;
		min-height: 0;
		max-height: none;
		aspect-ratio: auto;
	}

	:global(.deck.listening) .video:not(:has(.native-audio-player)),
	:global(.deck.auto) .video:not(:has(.native-audio-player)) {
		aspect-ratio: auto;
	}

	:global(.deck.listening) .video-hidden-placeholder,
	:global(.deck.auto) .video-hidden-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.video-hidden-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1 1 auto;
		min-height: 0;
		max-height: none;
		aspect-ratio: auto;
		background: transparent;
		color: color-mix(in srgb, var(--gray-9) 55%, transparent);
	}

	.video-hidden-placeholder :global(svg) {
		width: min(24%, 6rem);
		height: auto;
		opacity: 0.9;
	}

	.native-audio-player {
		width: 100%;
	}

	.bottom-chrome {
		border-top: 1px solid var(--color-interface-border);
		margin-top: auto;
		display: flex;
		flex-direction: column;

		@media (max-width: 768px) {
			margin-top: 0;
		}
	}

	:global(.deck.listening) .bottom-chrome {
		margin-top: 0;
	}

	.track-panel {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		cursor: var(--interactive-cursor, pointer);
		:global(article) {
			flex: 1 1 auto;
			min-width: 0;
		}
	}

	.listening-track-panel {
		display: flex;
		align-items: center;
		flex: 1 1 auto;
		min-width: 0;
	}

	.listening-track-panel :global(article) {
		flex: 1 1 auto;
		min-width: 0;
	}
</style>
