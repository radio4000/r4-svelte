<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {startBroadcast, stopBroadcast} from '$lib/broadcast'
	import {getMediaPlayer, playChannel, togglePlayPause, toggleChannelAutoRadio} from '$lib/api'
	import {findAutoDecksForChannel, findLoadedDeck, findPlayingDeck} from '$lib/deck'
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
		if (!deck?.playlist_track || deck.playlist_slug !== channel.slug) {
			await playChannel(deckId, channel)
		}
		const player = getMediaPlayer(deckId)
		if (player?.paused) player.play()
		const trackId = appState.decks[deckId]?.playlist_track
		if (!trackId) return
		await startBroadcast(channel.id, trackId)
		if (appState.decks[deckId]) appState.decks[deckId].broadcasting_channel_id = channel.id
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
	}

	/* Flatten individual button borders so the group border takes over */
	.my-channel-controls button {
		border: none;
		border-right: 1px solid var(--gray-6);
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}

	.my-channel-controls button:hover {
		border-color: var(--gray-6);
		background: var(--gray-3);
	}

	/* Active state: accent color only, keep divider intact */
	.my-channel-controls button.active {
		border-right-color: var(--gray-6);
		background: transparent;
	}

	.channel-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.45rem;
		min-height: 2rem;
		text-decoration: none;
		border-left: 1px solid var(--gray-6);
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
