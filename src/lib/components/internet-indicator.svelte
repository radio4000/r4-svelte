<script lang="ts">
	import Icon from '#lib/components/icon.svelte'
	import {useOnline} from '#lib/online.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

	const {href}: {href?: string} = $props()
	const {online} = useOnline()
</script>

{#if !online}
	{#if href}
		<a {href} class="offline-indicator" aria-label={m.status_offline()}>
			<Icon icon="wifi-off" />
		</a>
	{:else}
		<span class="offline-indicator">
			<Icon icon="wifi-off" />
		</span>
	{/if}
{/if}

<style>
	.offline-indicator {
		display: inline-flex;
		color: var(--color-red);
	}
</style>
