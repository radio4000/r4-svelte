<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {startChannelBroadcast, stopBroadcast} from '#lib/broadcast.js'
	import {findLoadedDeck, isBroadcasting as isBroadcastingDeck} from '#lib/deck.js'
	import {channelPresence, watchPresence, unwatchPresence} from '#lib/presence.svelte.js'
	import Icon from '#lib/components/icon.svelte'
	import PresenceCount from '#lib/components/presence-count.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {{channel: import('#lib/types.js').Channel, class?: string}} */
	let {channel, class: className = ''} = $props()

	const isBroadcasting = $derived(isBroadcastingDeck(appState.decks, channel.id))
	const loadedDeckId = $derived(
		findLoadedDeck(appState.decks, channel.slug)?.id ?? appState.active_deck_id
	)
	const livePresenceCount = $derived(channelPresence[channel.slug]?.broadcast ?? 0)

	$effect(() => {
		watchPresence(channel.slug)
		return () => unwatchPresence(channel.slug)
	})

	async function onBroadcastAction() {
		if (isBroadcasting) {
			await stopBroadcast(channel.id)
		} else {
			await startChannelBroadcast(channel, {deckId: loadedDeckId})
		}
	}
</script>

<button
	type="button"
	class={['btn', 'broadcast-toggle', className, {broadcasting: isBroadcasting}]}
	onclick={onBroadcastAction}
	{@attach tooltip({
		content: isBroadcasting ? m.broadcast_stop_button() : m.broadcast_start_button()
	})}
>
	<Icon icon="signal" />
	<span class="btn-label">{isBroadcasting ? m.status_live_short() : m.nav_broadcast()}</span>
	{#if livePresenceCount > 0}<PresenceCount count={livePresenceCount} corner />{/if}
</button>

<style>
	.broadcast-toggle {
		position: relative;
	}

	/* svg follows currentColor (see header's `nav .btn svg { color: currentColor }`) */
	.broadcast-toggle.broadcasting {
		color: var(--accent-9);
	}
</style>
