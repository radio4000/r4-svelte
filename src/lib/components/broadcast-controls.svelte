<script>
	import {appState} from '$lib/app-state.svelte'
	import {startBroadcast, stopBroadcast} from '$lib/broadcast'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const userChannelId = $derived(appState?.channels?.[0])
	// Access .state.size to create reactive dependency, then check if broadcasting
	const isBroadcasting = $derived(
		userChannelId && (broadcastsCollection.state.size, broadcastsCollection.state.get(userChannelId))
	)
	let error = $state(/** @type {string|null} */ (null))

	$effect(() => {
		void appState.playlist_track
		error = null
	})

	$effect(() => {
		appState.broadcasting_channel_id = isBroadcasting ? userChannelId : undefined
	})

	async function stopBroadcasting() {
		if (userChannelId) {
			await stopBroadcast(userChannelId)
		}
		appState.broadcasting_channel_id = undefined
	}

	async function start() {
		error = null
		if (!appState.playlist_track) {
			error = m.broadcast_requires_track()
			return
		}

		/** @type {HTMLElement & {paused: boolean, play(): void} | null} */
		const player = document.querySelector('youtube-video')
		if (player?.paused) player.play()

		if (userChannelId && appState.playlist_track) {
			try {
				await startBroadcast(userChannelId, appState.playlist_track)
				appState.broadcasting_channel_id = userChannelId
			} catch (e) {
				error = /** @type {Error} */ (e).message
			}
		}
	}
</script>

{#if userChannelId}
	<div>
		{#if isBroadcasting}
			<button onclick={() => stopBroadcasting()}>{m.broadcast_stop_button()}</button>
		{:else}
			<button onclick={start}>
				<Icon icon="signal" strokeWidth={1.7}></Icon>
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
		<Icon icon="signal" strokeWidth={1.7}></Icon>
		{m.broadcast_login_prompt()}
	</a>
{/if}

<style>
	[role='alert'] {
		color: var(--red-3);
		margin-block: var(--space-2);
	}
</style>
