<script>
	import '../styles/style.css'
	import 'leaflet/dist/leaflet.css'
	import {initAppState, useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import LayoutFooter from '$lib/components/layout-footer.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
	import QueuePanel from '$lib/components/queue-panel.svelte'
	import '@radio4000/components'
	import {onMount} from 'svelte'
	import {checkUser} from '$lib/api'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import {logger} from '$lib/logger'
	import {QueryClient, QueryClientProvider} from '@tanstack/svelte-query'
	import {persistQueryClient} from '@tanstack/query-persist-client-core'
	import {createSyncStoragePersister} from '@tanstack/query-sync-storage-persister'

	const log = logger.ns('layout').seal()

	// Create TanStack Query client for collections
	const persister = createSyncStoragePersister({
		storage: typeof window !== 'undefined' ? window.localStorage : undefined,
		key: 'r5-tanstack-cache'
	})

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				gcTime: 1000 * 60 * 60 * 24, // 24 hours
				staleTime: 1000 * 60 * 5, // 5 minutes
				refetchOnMount: false,
				refetchOnWindowFocus: false
			}
		}
	})

	if (typeof window !== 'undefined') {
		persistQueryClient({
			queryClient,
			persister,
			maxAge: Infinity
		})
	}

	// Initialize TanStack DB collections with queryClient
	import {initCollections} from '$lib/collections'
	initCollections(queryClient)

	/** @type {import('./$types').LayoutProps} */
	const {data, children} = $props()

	let chatPanelVisible = $state(false)

	// Get app state from collection
	const appState = $derived(useAppState().data)

	onMount(async () => {
		await initAppState()
		await checkUser()
		if (appState) {
			applyCustomCssVariables(appState.custom_css_variables)
			// Ensure channels_display has a value
			if (!appState.channels_display) {
				appStateCollection.update(1, (draft) => {
					draft.channels_display = 'grid'
				})
			}
		}
	})

	// Theme application
	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const theme = $derived(appState?.theme ?? (prefersLight ? 'light' : 'dark'))

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
		if (appState) {
			applyCustomCssVariables(appState.custom_css_variables)
		}
	})

	// Clean up on page unload
	$effect(() => {
		const handler = async () => {
			log.log('beforeunload_cleanup')
			appStateCollection.update(1, (draft) => {
				draft.broadcasting_channel_id = undefined
			})
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	})
</script>

<QueryClientProvider client={queryClient}>
	<svelte:boundary>
		{#await data.preloading then}
			<AuthListener />
			<KeyboardShortcuts />
		{/await}

		<div class={['layout', {asideVisible: appState?.queue_panel_visible}]}>
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
</QueryClientProvider>

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
