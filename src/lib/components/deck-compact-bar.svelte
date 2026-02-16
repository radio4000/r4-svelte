<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {togglePlayPause, next, previous, getMediaPlayer} from '$lib/api'
	import {queuePrev} from '$lib/player/queue'
	import {inferPlayerProvider} from '$lib/media'
	import {getBroadcastingChannelId, notifyBroadcastState} from '$lib/broadcast'
	import 'media-chrome'
	import Icon from '$lib/components/icon.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'

	/** @type {{deckId: number}} */
	let {deckId} = $props()

	let deck = $derived(appState.decks[deckId])

	let track = $derived.by(() => {
		const id = deck?.playlist_track
		if (!id) return undefined
		return tracksCollection.state.get(id)
	})

	let channel = $derived.by(() => {
		if (!track?.slug) return undefined
		return [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
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
	let provider = $derived(inferPlayerProvider(displayTrack?.provider, displayTrack?.url))
	let supportsPlaybackSpeed = $derived(provider !== 'soundcloud' && Boolean(displayTrack))
	let useNativeAudio = $derived(provider === 'audio')
	let speedMin = $derived(useNativeAudio ? 0.25 : 0.25)
	let speedMax = $derived(useNativeAudio ? 3 : 2)
	let speedStep = $derived(useNativeAudio ? 0.01 : 0.25)

	let ytid = $derived(!displayTrack || appState.hide_track_artwork ? null : displayTrack.media_id)
	let imageSrc = $derived(ytid ? `https://i.ytimg.com/vi/${ytid}/mqdefault.jpg` : null)

	/** @type {string[]} */
	let trackIds = $derived(deck?.playlist_tracks || [])
	/** @type {string[]} */
	let activeQueue = $derived(deck?.shuffle ? deck?.playlist_tracks_shuffled || [] : trackIds)
	let hasTrackInQueue = $derived(Boolean(track?.id && activeQueue.includes(track.id)))
	let canPlayFromQueue = $derived(Boolean(activeQueue.length && hasTrackInQueue))
	let canPrevFromQueue = $derived(Boolean(track?.id && queuePrev(activeQueue, track.id)))
	let canNextFromQueue = $derived(Boolean(activeQueue.length > 1 && hasTrackInQueue))

	const mediaControllerId = $derived(`r5-deck-${deckId}`)

	function emitBroadcastUpdate() {
		const broadcastingChannelId = getBroadcastingChannelId()
		if (broadcastingChannelId) notifyBroadcastState(broadcastingChannelId)
	}

	function handleToggleMute() {
		if (!deck) return
		const mediaElement = getMediaPlayer(deckId)
		if (!mediaElement) return
		const nextMuted = !(mediaElement.muted ?? deck.muted ?? false)
		mediaElement.muted = nextMuted
		deck.muted = nextMuted
		emitBroadcastUpdate()
	}

	function handleMuteButtonClick() {
		if (!deck) return
		const mediaElement = getMediaPlayer(deckId)
		if (!mediaElement) return
		const before = Boolean(mediaElement.muted)
		queueMicrotask(() => {
			const after = Boolean(mediaElement.muted)
			if (after === before) {
				handleToggleMute()
				return
			}
			deck.muted = after
			emitBroadcastUpdate()
		})
	}
</script>

<div class="deck-compact-bar">
	{#if appState.show_track_range_control !== false && displayTrack}
		<div class="progress">
			<media-time-range mediacontroller={mediaControllerId}></media-time-range>
		</div>
	{/if}
	<div class="header-info" class:active-track-bg={Boolean(displayTrack)}>
		{#if displayChannel}
			<a class="avatar" href={resolve(`/${displayChannel.slug}`)}>
				<ChannelAvatar id={displayChannel.image} alt={displayChannel.name} />
			</a>
		{/if}
		{#if imageSrc && displayTrack && displaySlug}
			<a class="artwork" href={resolve(`/${displaySlug}/tracks/${displayTrack.id}`)}>
				<img src={imageSrc} alt={displayTrack.title} />
			</a>
		{/if}
		<div class="info">
			{#if displayChannel}
				<a class="channel active-track-title" href={resolve(`/${displayChannel.slug}`)}>{displayChannel.name}</a>
			{:else if displaySlug}
				<a class="channel active-track-title" href={resolve(`/${displaySlug}`)}>@{displaySlug}</a>
			{:else if displayTrack}
				<span class="channel active-track-title">@unknown</span>
			{/if}
			{#if displayTrack}
				{#if displaySlug}
					<a class="track active-track-title" href={resolve(`/${displaySlug}/tracks/${displayTrack.id}`)}
						>{displayTrack.title}</a
					>
				{:else}
					<span class="track active-track-title">{displayTrack.title}</span>
				{/if}
			{/if}
		</div>
	</div>
	<div class="row-controls">
		<div class="controls">
			<button
				onclick={() => previous(deckId, track, activeQueue, 'user_prev')}
				aria-label="Previous"
				disabled={!canPrevFromQueue}
			>
				<Icon icon="previous-fill" />
			</button>
			<button
				class="play"
				class:active={deck?.is_playing}
				onclick={() => togglePlayPause(deckId)}
				aria-label="Play/pause"
				disabled={!canPlayFromQueue}
			>
				<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
			</button>
			<button
				onclick={() => next(deckId, track, activeQueue, 'user_next')}
				aria-label="Next"
				disabled={!canNextFromQueue}
			>
				<Icon icon="next-fill" />
			</button>
		</div>
		{#if appState.show_speed_control && supportsPlaybackSpeed}
			<div class="speed">
				<button
					class="speed-btn"
					class:active={deck?.speed != null && deck.speed !== 1}
					onclick={() => {
						if (deck) deck.speed = 1
						const mediaElement = getMediaPlayer(deckId)
						if (mediaElement && 'playbackRate' in mediaElement) mediaElement.playbackRate = 1
						emitBroadcastUpdate()
					}}
				>
					{Number(deck?.speed ?? 1).toFixed(2)}x
				</button>
				<input
					type="range"
					min={speedMin}
					max={speedMax}
					step={speedStep}
					value={deck?.speed ?? 1}
					oninput={(e) => {
						const speed = Number(e.currentTarget.value)
						if (deck) deck.speed = speed
						const mediaElement = getMediaPlayer(deckId)
						if (mediaElement && 'playbackRate' in mediaElement) mediaElement.playbackRate = speed
						emitBroadcastUpdate()
					}}
					class="range"
					data-default={!deck?.speed || deck.speed === 1 || null}
				/>
			</div>
		{/if}
		<div class="volume">
			<media-mute-button
				mediacontroller={mediaControllerId}
				class="btn"
				class:active={Boolean(deck?.muted)}
				onclick={handleMuteButtonClick}
				aria-label="Mute"
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
					const mediaElement = getMediaPlayer(deckId)
					if (mediaElement) mediaElement.volume = val
					emitBroadcastUpdate()
				}}
				class="range"
				data-muted={deck?.muted || deck?.volume === 0 || null}
			/>
		</div>
		<button class="expand" onclick={() => (deck.compact = false)} aria-label="Expand deck">
			<Icon icon="sidebar-fill-right" />
		</button>
	</div>
</div>

<style>
	.deck-compact-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		background: var(--header-bg);
		min-width: 0;
		overflow: hidden;
	}

	.row-controls {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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

	.progress :global(media-time-range) {
		width: 100%;
		--media-range-track-height: 1px;
		--media-control-height: 9px;
		--media-control-background: transparent;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex-shrink: 0;
	}

	.header-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.1rem 0.2rem;
		min-width: 0;
		flex: 1 1 auto;
		order: 2;
	}

	.active-track-bg {
		background: var(--accent-2);
		border-radius: 4px;
	}

	.avatar {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		:global(img) {
			border-radius: var(--media-radius);
		}
	}

	.artwork {
		width: 32px;
		height: 32px;
		flex-shrink: 0;

		img {
			width: 100%;
			height: 100%;
			border-radius: var(--media-radius);
			object-fit: cover;
			object-position: center;
			display: block;
		}
	}

	.speed,
	.volume {
		display: flex;
		align-items: center;
		gap: 0.1rem;
		flex: 1 1 0;
		min-width: 0;
	}

	.speed-btn {
		font-size: var(--font-1);
		min-width: 2.5em;
		text-align: center;
		flex-shrink: 0;
	}

	.range {
		flex: 1 1 auto;
		width: 100%;
		min-width: 0;
		cursor: pointer;
		accent-color: var(--accent-9);
	}

	.range[data-muted],
	.range[data-default] {
		accent-color: var(--gray-7);
	}

	.volume :global(media-mute-button) {
		--media-control-background: transparent;
		--media-control-hover-background: transparent;
		--media-icon-color: currentColor;
		--media-icon-color-hover: currentColor;
		color: var(--text, var(--gray-12));
	}

	.volume :global(media-mute-button.active) {
		color: var(--accent-10);
		border-color: var(--accent-9);
		background-color: var(--accent-3);
	}

	.expand {
		flex-shrink: 0;
	}

	.info {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1 1 auto;
	}

	.channel,
	.track {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: inherit;
		text-decoration: none;
	}

	.active-track-title {
		display: inline-flex;
		align-self: flex-start;
		max-width: 100%;
		background: var(--accent-9);
		color: var(--gray-1);
		padding-inline: var(--space-1);
		border-radius: 2px;
	}

	.active-track-title:visited {
		color: var(--gray-1);
	}

	@media (max-width: 760px) {
		.deck-compact-bar {
			display: grid;
			grid-template-columns: 1fr;
			grid-template-areas:
				'progress'
				'info'
				'controls';
			row-gap: 0.25rem;
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
		.artwork {
			display: none;
		}

		.header-info {
			gap: 0.25rem;
		}

		.row-controls {
			gap: 0.2rem;
		}
	}
</style>
