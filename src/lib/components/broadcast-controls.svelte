<script>
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import {startBroadcast, stopBroadcast} from '$lib/broadcast'
	import Icon from '$lib/components/icon.svelte'

	const appState = $derived(useAppState().data)
	const userChannelId = $derived(appState?.channels?.[0])

	async function stopBroadcasting() {
		if (userChannelId) {
			await stopBroadcast(userChannelId)
		}
		appStateCollection.update(1, (draft) => {
			draft.broadcasting_channel_id = undefined
		})
	}

	async function start() {
		if (!appState?.playlist_track) {
			alert('You need to be playing a track to start broadcasting. Play something.')
		} else {
			/** @type {HTMLElement & {paused: boolean, play(): void} | null} */
			const player = document.querySelector('youtube-video')
			if (player?.paused) player.play()

			if (userChannelId && appState?.playlist_track) {
				await startBroadcast(userChannelId, appState.playlist_track)
				appStateCollection.update(1, (draft) => {
					draft.broadcasting_channel_id = userChannelId
				})
			}
		}
	}
</script>

{#if userChannelId}
	{#if appState?.broadcasting_channel_id}
		<button onclick={() => stopBroadcasting()}> Stop broadcasting </button>
	{:else}
		<button onclick={start}>
			<Icon icon="signal" size={20} strokeWidth={1.7}></Icon> Start broadcasting
		</button>
	{/if}
{:else}
	<a class="btn" href="/auth">
		<Icon icon="signal" size={20} strokeWidth={1.7}></Icon> Login to start broadcasting
	</a>
{/if}
