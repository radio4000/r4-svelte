<script>
	import {appState} from '$lib/app-state.svelte'
	import {startBroadcast, stopBroadcast} from '$lib/broadcast'
	import {getMediaPlayer} from '$lib/api'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{deckId?: number, channelId?: string, isLiveOverride?: boolean}} */
	let {deckId = 1, channelId, isLiveOverride} = $props()

	let deck = $derived(appState.decks[deckId])

	const userChannelId = $derived(channelId ?? appState?.channels?.[0])
	// Check collection only (source of truth) — deck state is synced via effect below
	const isBroadcasting = $derived.by(() => {
		if (typeof isLiveOverride === 'boolean') return isLiveOverride
		if (!userChannelId) return false
		void broadcastsCollection.state.size
		return broadcastsCollection.state.has(userChannelId)
	})
	let error = $state(/** @type {string|null} */ (null))
	const canStartBroadcast = $derived(Boolean(deck?.playlist_track))

	$effect(() => {
		void deck?.playlist_track
		error = null
	})

	// Sync broadcasting_channel_id from collection state → deck
	$effect(() => {
		if (deck) {
			deck.broadcasting_channel_id = isBroadcasting ? userChannelId : undefined
		}
	})

	async function stopBroadcasting() {
		error = null
		try {
			if (userChannelId) {
				await stopBroadcast(userChannelId)
			}
			if (deck) deck.broadcasting_channel_id = undefined
		} catch (e) {
			error = /** @type {Error} */ (e).message
		}
	}

	async function start() {
		error = null
		if (!deck?.playlist_track) {
			error = m.broadcast_requires_track()
			return
		}

		const player = getMediaPlayer(deckId)
		if (player?.paused) player.play()

		if (userChannelId && deck.playlist_track) {
			try {
				await startBroadcast(userChannelId, deck.playlist_track)
				deck.broadcasting_channel_id = userChannelId
			} catch (e) {
				error = /** @type {Error} */ (e).message
			}
		}
	}
</script>

{#if userChannelId}
	<div>
		{#if isBroadcasting}
			<button class="active" onclick={() => stopBroadcasting()}>
				<Icon icon="cell-signal" strokeWidth={1.7} />
				{m.broadcast_stop_button()}
			</button>
		{:else if canStartBroadcast}
			<button onclick={start}>
				<Icon icon="cell-signal" strokeWidth={1.7}></Icon>
				{m.broadcast_start_button()}
			</button>
		{/if}
		{#if error}
			<p role="alert">
				{error}. You can still listen, but listeners won't hear this track.
			</p>
		{/if}
	</div>
{:else}
	<a class="btn" href="/auth">
		<Icon icon="cell-signal" strokeWidth={1.7}></Icon>
		{m.broadcast_login_prompt()}
	</a>
{/if}

<style>
	[role='alert'] {
		color: var(--red-3);
		margin-block: var(--space-2);
	}
</style>
