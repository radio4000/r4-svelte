<script>
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import {
		startChannelBroadcast,
		stopBroadcast,
		getBroadcastingChannelId,
		isUserBroadcasting
	} from '#lib/broadcast.js'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import {channelPresence} from '#lib/presence.svelte.js'
	import PresenceCount from '#lib/components/presence-count.svelte'

	/** @type {{deckId?: number, channelId?: string, channelSlug?: string, isLiveOverride?: boolean, compact?: boolean, showPresence?: boolean}} */
	let {
		deckId = 1,
		channelId,
		channelSlug,
		isLiveOverride,
		compact = false,
		showPresence = true
	} = $props()

	let deck = $derived(appState.decks[deckId])

	// Prefer explicit channelId, then currently broadcasting channel, then default user channel.
	const userChannelId = $derived(channelId ?? getBroadcastingChannelId() ?? appState?.channels?.[0])
	const isBroadcasting = $derived.by(() => {
		if (typeof isLiveOverride === 'boolean') return isLiveOverride
		if (!userChannelId) return false
		return isUserBroadcasting(userChannelId)
	})
	let error = $state(/** @type {string|null} */ (null))
	const playingDeck = $derived.by(() =>
		Object.values(appState.decks).find((d) => Boolean(d?.is_playing && d?.playlist_track))
	)
	const canStartBroadcast = $derived(
		Boolean(deck?.playlist_track || playingDeck?.playlist_track || channelSlug)
	)

	$effect(() => {
		void deck?.playlist_track
		error = null
	})

	// Mirror computed broadcast state to the active deck for local UI consumers.
	// Skip when isLiveOverride is provided: that's a read-only display signal from the channel page
	// and should not write back to the deck (would transiently clear broadcasting_channel_id on mount).
	$effect(() => {
		if (deck && typeof isLiveOverride !== 'boolean') {
			deck.broadcasting_channel_id = isBroadcasting ? userChannelId : undefined
		}
	})

	async function stopBroadcasting() {
		error = null
		try {
			if (userChannelId) await stopBroadcast(userChannelId)
		} catch (e) {
			error = /** @type {Error} */ (e).message
		}
	}

	async function start() {
		error = null
		try {
			const res = await startChannelBroadcast(
				{id: /** @type {string} */ (userChannelId), slug: /** @type {string} */ (channelSlug)},
				{deckId}
			)
			if (!res.ok && res.reason === 'no-track') error = m.broadcast_requires_track()
		} catch (e) {
			error = /** @type {Error} */ (e).message
		}
	}
</script>

{#if userChannelId}
	<div>
		{#if showPresence && channelSlug && channelPresence[channelSlug]?.broadcast > 0}
			<PresenceCount count={channelPresence[channelSlug].broadcast} />
		{/if}

		{#if isBroadcasting}
			<button
				class="active"
				class:compact
				onclick={() => stopBroadcasting()}
				title={m.broadcast_stop_button()}
				aria-label={m.broadcast_stop_button()}
			>
				<Icon icon="signal" strokeWidth={1.7} />
				{#if !compact}{m.broadcast_stop_button()}{/if}
			</button>
		{:else if canStartBroadcast}
			<button
				onclick={start}
				class:compact
				title={m.broadcast_start_button()}
				aria-label={m.broadcast_start_button()}
			>
				<Icon icon="signal" strokeWidth={1.7} />
				{#if !compact}{m.broadcast_start_button()}{/if}
			</button>
		{:else}
			<button
				disabled
				class:compact
				title={m.broadcast_requires_track()}
				aria-label={m.broadcast_requires_track()}
			>
				<Icon icon="signal" strokeWidth={1.7} />
				{#if !compact}{m.broadcast_start_button()}{/if}
			</button>
		{/if}
		{#if error}
			<p role="alert">
				{error}. {m.broadcast_listener_warning()}
			</p>
		{/if}
	</div>
{:else}
	<a class="btn" href={resolve('/auth')} class:compact title={m.broadcast_login_prompt()}>
		<Icon icon="signal" strokeWidth={1.7} />
		{#if !compact}{m.broadcast_login_prompt()}{/if}
	</a>
{/if}

<style>
	.compact {
		padding-inline: 0.5rem;
		min-width: 2rem;
	}

	[role='alert'] {
		color: var(--red-3);
		margin-block: var(--space-2);
	}
</style>
