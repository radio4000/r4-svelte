<script>
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let online = $state(navigator.onLine)

	$effect(() => {
		const goOffline = () => {
			online = false
		}
		const goOnline = () => {
			online = true
		}
		window.addEventListener('offline', goOffline)
		window.addEventListener('online', goOnline)
		return () => {
			window.removeEventListener('offline', goOffline)
			window.removeEventListener('online', goOnline)
		}
	})
</script>

<div data-online={online}>
	{#if online}
		<Icon icon="wifi" />
		<p>{m.status_online()}</p>
	{:else}
		<Icon icon="wifi-off" />
		<p>{m.status_offline()}</p>
	{/if}
</div>

<style>
	div {
		display: flex;
		gap: 0.3em;
		align-items: center;
		color: var(--color-red);
	}
	p {
		margin: 0;
	}
	div[data-online='true'] {
		color: var(--color-green);
	}
	div :global(svg) {
		position: relative;
		top: -1px;
		width: 1rem;
	}
</style>
