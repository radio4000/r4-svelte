<script>
	import BroadcastControls from '$lib/components/broadcast-controls.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{
	 *  channelId: string,
	 *  channelSlug: string,
	 *  deckId: number,
	 *  isLive: boolean,
	 *  canEdit: boolean,
	 *  isListening?: boolean,
	 *  presenceCount?: number,
	 *  onJoin?: () => void,
	 *  onLeave?: () => void,
	 * }} */
	let {
		channelId,
		channelSlug,
		deckId,
		isLive,
		canEdit,
		isListening = false,
		presenceCount = 0,
		onJoin,
		onLeave
	} = $props()
</script>

{#if isLive}
	<div class="broadcast-live-controls">
		<PresenceCount count={presenceCount} />
		<span class="channel-badge live-pill">
			<Icon icon="cell-signal" size={12} />
			{m.status_live_short()}
		</span>
		{#if canEdit}
			<BroadcastControls
				{deckId}
				{channelId}
				{channelSlug}
				isLiveOverride={isLive}
				showPresence={false}
			/>
		{:else if channelId}
			<button
				type="button"
				class:active={isListening}
				onclick={() => (isListening ? onLeave?.() : onJoin?.())}
				title={isListening ? m.broadcasts_leave() : m.broadcasts_join()}
				aria-label={isListening ? m.broadcasts_leave() : m.broadcasts_join()}
			>
				<Icon icon="signal" />
				{isListening ? m.broadcasts_leave() : m.broadcasts_join()}
			</button>
		{/if}
	</div>
{:else if canEdit}
	<BroadcastControls {deckId} {channelId} {channelSlug} isLiveOverride={isLive} />
{/if}

<style>
	.broadcast-live-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.live-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
</style>
