<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {startBroadcast, stopBroadcast} from '$lib/broadcast'
	import {getMediaPlayer, playChannel, togglePlayPause, toggleChannelAutoRadio} from '$lib/api'
	import {findAutoDecksForChannel, findLoadedDeck, findPlayingDeck} from '$lib/deck'
	import {tracksCollection} from '$lib/collections/tracks'
	import {hasAutoRadioCoverage} from '$lib/player/auto-radio'
	import {channelPresence, watchPresence, unwatchPresence} from '$lib/presence.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	/** @type {{channel: import('$lib/types').Channel}} */
	let {channel} = $props()

	const isBroadcasting = $derived(
		Object.values(appState.decks).some((d) => d.broadcasting_channel_id === channel.id)
	)
	const autoDecks = $derived(findAutoDecksForChannel(appState.decks, channel.slug))
	const isAutoEnabled = $derived(autoDecks.length > 0)
	const loadedDeckId = $derived(
		findLoadedDeck(appState.decks, channel.slug)?.id ?? appState.active_deck_id
	)
	const isPlaying = $derived(Boolean(findPlayingDeck(appState.decks, channel.slug)))
	const canShowAutoButton = $derived.by(() => {
		void tracksCollection.state.size
		const channelTracks = [...tracksCollection.state.values()].filter(
			(track) => track.slug === channel.slug
		)
		return hasAutoRadioCoverage(channelTracks)
	})
	const livePresenceCount = $derived(channelPresence[channel.slug]?.broadcast ?? 0)
	const autoPresenceCount = $derived(
		channelPresence[channel.slug]?.byUri?.[`@${channel.slug}`] ?? 0
	)

	$effect(() => {
		watchPresence(channel.slug)
		return () => unwatchPresence(channel.slug)
	})

	async function onBroadcastAction() {
		const deckId = loadedDeckId
		const deck = appState.decks[deckId]
		if (isBroadcasting) {
			await stopBroadcast(channel.id)
			if (deck) deck.broadcasting_channel_id = undefined
			return
		}

		const activeDeck = appState.decks[appState.active_deck_id]
		const currentlyPlayingDeck =
			activeDeck?.is_playing && activeDeck?.playlist_track
				? activeDeck
				: Object.values(appState.decks).find((d) => Boolean(d?.is_playing && d?.playlist_track))

		let sourceDeckId = deckId
		let trackId = deck?.playlist_track
		let startedByAutoPlay = false

		// If any deck is already playing, broadcast that current track as-is.
		if (currentlyPlayingDeck?.playlist_track) {
			sourceDeckId = currentlyPlayingDeck.id
			trackId = currentlyPlayingDeck.playlist_track
		}

		// Only auto-play this channel if nothing is currently playing.
		if (!trackId) {
			await playChannel(deckId, channel)
			sourceDeckId = deckId
			trackId = appState.decks[deckId]?.playlist_track
			startedByAutoPlay = true
		}

		if (startedByAutoPlay) {
			const player = getMediaPlayer(sourceDeckId)
			if (player?.paused) player.play()
		}

		if (!trackId) return
		await startBroadcast(channel.id, trackId)
		if (appState.decks[sourceDeckId])
			appState.decks[sourceDeckId].broadcasting_channel_id = channel.id
	}

	function onPlayAction() {
		if (isPlaying) {
			togglePlayPause(loadedDeckId)
		} else {
			playChannel(loadedDeckId, channel)
		}
	}

	async function onAutoAction() {
		await toggleChannelAutoRadio(channel.slug)
	}
</script>

<menu class="my-channel-controls nav-grouped">
	<button
		type="button"
		class:active={isBroadcasting}
		onclick={onBroadcastAction}
		{@attach tooltip({
			content: isBroadcasting ? m.broadcast_stop_button() : m.broadcast_start_button()
		})}
	>
		<Icon icon="signal" size={14} />
		{#if livePresenceCount > 0}
			<PresenceCount count={livePresenceCount} />
		{/if}
	</button>

	{#if canShowAutoButton}
		<button
			type="button"
			class:active={isAutoEnabled}
			onclick={onAutoAction}
			{@attach tooltip({content: m.auto_radio_join()})}
		>
			<Icon icon="infinite" size={14} />
			{#if autoPresenceCount > 0}
				<PresenceCount count={autoPresenceCount} />
			{/if}
		</button>
	{/if}

	<button
		type="button"
		class:active={isPlaying}
		onclick={onPlayAction}
		{@attach tooltip({content: isPlaying ? m.common_pause() : m.common_play()})}
	>
		<Icon icon={isPlaying ? 'pause' : 'play-fill'} size={14} />
	</button>

	<a
		class="channel-link"
		href={resolve('/[slug]', {slug: channel.slug})}
		{@attach tooltip({content: `@${channel.slug}`})}
	>
		<span class="avatar">
			<ChannelAvatar id={channel.image} alt={channel.name} />
		</span>
		<span class="slug">@{channel.slug}</span>
	</a>
</menu>

<style>
	.my-channel-controls {
		margin: 0 0 0 auto;
		gap: 0.1rem;
	}

	.my-channel-controls button {
		border: none;
		box-shadow: none;
	}

	.my-channel-controls button.active {
		background: var(--accent-3);
	}

	.channel-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.45rem;
		min-height: 2rem;
		text-decoration: none;
	}

	.avatar {
		width: 1.4rem;
		height: 1.4rem;
		flex-shrink: 0;

		:global(img, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.15rem);
			object-fit: cover;
		}
	}

	.slug {
		font-size: var(--font-2);
		color: var(--gray-11);

		@media (max-width: 480px) {
			display: none;
		}
	}
</style>
