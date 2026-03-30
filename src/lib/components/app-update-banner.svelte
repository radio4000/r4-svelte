<script>
	import {onMount} from 'svelte'

	let visible = $state(false)
	/** @type {((reloadPage?: boolean) => Promise<void>) | undefined} */
	let updateSW = $state()

	onMount(async () => {
		const {registerSW} = await import('virtual:pwa-register')
		updateSW = registerSW({
			immediate: true,
			onNeedRefresh() {
				visible = true
			}
		})
	})
</script>

{#if visible}
	<div data-sw-update>
		<span>New version of Radio4000 available</span>
		<menu>
			<button onclick={() => updateSW?.(true)}>Reload to update</button>
			<button onclick={() => (visible = false)}>Dismiss</button>
		</menu>
	</div>
{/if}

<style>
	[data-sw-update] {
		max-width: 50ch;
		position: fixed;
		top: var(--interface-margin);
		right: var(--interface-margin);
		z-index: 9999;
		display: flex;
		flex-flow: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		background: var(--accent-3);
		border: 1px solid var(--accent-6);
		border-radius: var(--border-radius);
	}
</style>
