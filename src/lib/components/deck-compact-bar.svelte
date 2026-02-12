<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {togglePlayPause, next, previous, getMediaPlayer} from '$lib/api'
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

	let ytid = $derived(!track || appState.hide_track_artwork ? null : track.media_id)
	let imageSrc = $derived(ytid ? `https://i.ytimg.com/vi/${ytid}/mqdefault.jpg` : null)

	/** @type {string[]} */
	let trackIds = $derived(deck?.playlist_tracks || [])
	/** @type {string[]} */
	let activeQueue = $derived(deck?.shuffle ? deck?.playlist_tracks_shuffled || [] : trackIds)

	const mediaControllerId = $derived(`r5-deck-${deckId}`)
</script>

<div class="deck-compact-bar">
	<div class="header-info">
		{#if channel}
			<a class="avatar" href={resolve(`/${channel.slug}`)}>
				<ChannelAvatar id={channel.image} alt={channel.name} />
			</a>
		{/if}
		{#if imageSrc && track && channel}
			<a class="artwork" href={resolve(`/${channel.slug}/tracks/${track.id}`)}>
				<img src={imageSrc} alt={track.title} />
			</a>
		{/if}
		<div class="info">
			{#if channel}
				<a class="channel" href={resolve(`/${channel.slug}`)}>{channel.name}</a>
			{/if}
			{#if track}
				<a class="track" href={resolve(`/${channel?.slug}/tracks/${track.id}`)}>{track.title}</a>
			{/if}
		</div>
		<button class="expand" onclick={() => (deck.compact = false)} aria-label="Expand deck">
			<Icon icon="sidebar-fill-right" />
		</button>
	</div>
	<div class="row-controls">
		<div class="controls">
			<button onclick={() => previous(deckId, track, activeQueue, 'user_prev')} aria-label="Previous">
				<Icon icon="previous-fill" />
			</button>
			<button class="play" onclick={() => togglePlayPause(deckId)} aria-label="Play/pause">
				<Icon icon={deck?.is_playing ? 'pause' : 'play-fill'} />
			</button>
			<button onclick={() => next(deckId, track, activeQueue, 'user_next')} aria-label="Next">
				<Icon icon="next-fill" />
			</button>
		</div>
		{#if appState.show_speed_control}
			<div class="speed">
				<button
					class="speed-btn"
					class:active={deck?.speed != null && deck.speed !== 1}
					onclick={() => { if (deck) deck.speed = 1 }}
				>
					{deck?.speed ?? 1}x
				</button>
				<input
					type="range"
					min="0.25"
					max="2"
					step="0.25"
					value={deck?.speed ?? 1}
					oninput={(e) => {
						if (deck) deck.speed = Number(e.currentTarget.value)
					}}
					class="range"
					data-default={!deck?.speed || deck.speed === 1 || null}
				/>
			</div>
		{/if}
		<div class="volume">
			<media-mute-button mediacontroller={mediaControllerId} class="btn"></media-mute-button>
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
				}}
				class="range"
				data-muted={deck?.muted || deck?.volume === 0 || null}
			/>
		</div>
	</div>
</div>

<style>
	.deck-compact-bar {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		background: var(--header-bg);
		min-width: 0;
	}

	.row-controls {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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
		min-width: 0;
		flex: 1;
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
		flex: 1;
		min-width: 0;
	}

	.speed-btn {
		font-size: var(--font-1);
		min-width: 2.5em;
		text-align: center;
		flex-shrink: 0;
	}

	.range {
		flex: 1 1 0;
		min-width: 0;
		width: 100%;
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
	}

	.volume :global(media-mute-button[mediavolumelevel='off']) {
		border-color: var(--accent-9);
		background-color: var(--accent-3);
	}

	.expand {
		flex-shrink: 0;
		margin-left: auto;
	}

	.info {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.channel,
	.track {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: inherit;
		text-decoration: none;
	}
</style>
