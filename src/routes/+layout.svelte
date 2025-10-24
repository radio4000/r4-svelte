<script>
	import '../styles/style.css'
	import 'leaflet/dist/leaflet.css'
	import {appState, persistAppState} from '$lib/app-state.svelte'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import LayoutFooter from '$lib/components/layout-footer.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
	import QueuePanel from '$lib/components/queue-panel.svelte'
	import '@radio4000/components'
	import {onMount} from 'svelte'
	import {goto} from '$app/navigation'
	import {checkUser} from '$lib/api'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import {logger} from '$lib/logger'

	const log = logger.ns('layout').seal()

	/** @type {import('./$types').LayoutProps} */
	const {data, children} = $props()

	let skipPersist = $state(true)
	let chatPanelVisible = $state(false)

	onMount(async () => {
		await checkUser()
		applyCustomCssVariables(appState.custom_css_variables)
		// Ensure channels_display has a value before persisting
		if (!appState.channels_display) {
			appState.channels_display = 'grid'
		}
		skipPersist = false
	})

	// Theme application
	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const theme = $derived(appState.theme ?? (prefersLight ? 'light' : 'dark'))

	$effect(() => {
		if (theme === 'dark') {
			document.documentElement.classList.remove('light')
			document.documentElement.classList.add('dark')
		} else {
			document.documentElement.classList.remove('dark')
			document.documentElement.classList.add('light')
		}
	})

	$effect(() => {
		applyCustomCssVariables(appState.custom_css_variables)
	})

	$effect(() => {
		if (skipPersist) return
		// Take a snapshot to track all property changes
		$state.snapshot(appState)
		persistAppState()
			.then(() => {
				log.debug('app_state', $state.snapshot(appState))
			})
			.catch((err) => {
				goto(`/recovery?err=${err.message}`)
			})
	})

	// "Close" the database on page unload. I have not noticed any difference, but seems like a good thing to do.
	$effect(() => {
		const handler = async () => {
			log.log('beforeunload_closing_db')
			// event.preventDefault()
			appState.broadcasting_channel_id = undefined
			//await pg.close()
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	})
</script>

<svelte:boundary>
	{#await data.preloading then}
		<AuthListener />
		<KeyboardShortcuts />
	{/await}

	<div class={['layout', {asideVisible: appState.queue_panel_visible}]}>
		{#await data.preloading then}
			<LayoutHeader preloading={data.preloading} />
		{/await}

		<div class="content">
			<main class="scroll">
				{#await data.preloading}
					<div class="loader">
						<p>Preparing R5&hellip;</p>
						<r4-loading></r4-loading>
					</div>
				{:then}
					{@render children()}
				{/await}
			</main>

			{#await data.preloading then}
				<QueuePanel />
			{/await}

			{#if chatPanelVisible}
				<DraggablePanel title="R4 Chat">
					<LiveChat />
				</DraggablePanel>
			{/if}
		</div>

		{#await data.preloading then}
			<LayoutFooter />
		{/await}
	</div>
	{#snippet pending()}
		<p>loading...</p>
	{/snippet}
</svelte:boundary>

<style>
	.layout {
		--aside-width: min(60ch, 100%);

		display: grid;
		grid-template-rows: auto 1fr auto;
		height: 100vh;
	}

	.content {
		/*display: grid;
		grid-template-columns: 1fr;
		height: 100%;
		overflow: hidden;
		position: relative;*/

		> :global(aside) {
			transform: translate3d(100%, 0, 0);
			position: absolute;
			right: 0;
			top: 0;
			bottom: 0;
			width: var(--aside-width);
			transition: transform 100ms ease-in;
		}
	}

	.asideVisible .content {
		grid-template-columns: 1fr var(--aside-width);
		> :global(aside) {
			display: flex;
			transform: translate3d(0, 0, 0);
			transition-duration: 200ms;
			transition-timing-function: ease-out;
		}
	}

	.scroll {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
	}

	.loader {
		margin: 1rem;
		min-height: 80vh;
		align-self: center;
		display: flex;
		flex-flow: column;
		place-content: center;
		place-items: center;
		max-width: 40ch;
	}

	r4-loading {
		margin-top: 1rem;
		display: flex;
		flex-flow: column;
	}
</style>
