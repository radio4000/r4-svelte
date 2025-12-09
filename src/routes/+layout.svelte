<script>
	import '../styles/style.css'
	import 'leaflet/dist/leaflet.css'
	import {appState} from '$lib/app-state.svelte'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import LayoutFooter from '$lib/components/layout-footer.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
	import QueuePanel from '$lib/components/queue-panel.svelte'
	import '@radio4000/components'
	import {onMount, setContext} from 'svelte'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import {logger} from '$lib/logger'
	import * as m from '$lib/paraglide/messages'
	import {getLocale, setLocale, locales, isLocale} from '$lib/paraglide/runtime'
	import {QueryClientProvider} from '@tanstack/svelte-query'
	import {SvelteQueryDevtools} from '@tanstack/svelte-query-devtools'
	import {queryClient, channelsCollection} from './tanstack/collections'
	import {useLiveQuery} from '@tanstack/svelte-db'

	const log = logger.ns('layout').seal()

	/** @type {import('./$types').LayoutProps} */
	const {data, children} = $props()

	// Query channels once at layout level, share via context
	// Defer useLiveQuery until after preloading to avoid state_unsafe_mutation during hydration
	const channelsQuery = useLiveQuery((q) => q.from({channels: channelsCollection}))
	let channels = $derived(channelsQuery?.data || [])
	setContext('channels', () => channels)

	let chatPanelVisible = $state(false)
	const rtlLocales = new Set(['ar', 'ur'])

	function inferNavigatorLocale() {
		if (typeof navigator === 'undefined') return undefined
		const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
		for (const entry of preferred) {
			if (!entry) continue
			const normalized = entry.toLowerCase()
			const exact = locales.find((loc) => loc.toLowerCase() === normalized)
			if (exact) return exact
			const short = normalized.split('-')[0]
			const shortMatch = locales.find((loc) => loc.split('-')[0].toLowerCase() === short)
			if (shortMatch) return shortMatch
		}
		return undefined
	}

	onMount(async () => {
		try {
			await data.preloading
		} catch (err) {
			log.warn('preloading_failed_before_mount', err)
		}
		// checkUser() is now called by auth-listener on INITIAL_SESSION to avoid duplicate calls
		applyCustomCssVariables(appState.custom_css_variables)
		// Ensure channels_display has a value before persisting
		if (!appState.channels_display) {
			appState.channels_display = 'grid'
		}
		const storedLocale = appState.language
		const validStoredLocale = storedLocale && isLocale(storedLocale) ? storedLocale : null
		const currentLocale = validStoredLocale || inferNavigatorLocale() || getLocale()
		await setLocale(currentLocale, {reload: false})
		if (!storedLocale) {
			appState.language = currentLocale
		}
	})

	// Theme application
	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const theme = $derived(appState.theme ?? (prefersLight ? 'light' : 'dark'))
	const uiLocale = $derived(appState.language ?? getLocale())

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
		if (typeof document === 'undefined') return
		document.documentElement.lang = uiLocale
		document.documentElement.dir = rtlLocales.has(uiLocale) ? 'rtl' : 'ltr'
	})

	$effect(() => {
		applyCustomCssVariables(appState.custom_css_variables)
	})

	// "Close" the database on page unload. I have not noticed any difference, but seems like a good thing to do.
	$effect(() => {
		const handler = async () => {
			log.log('beforeunload_closing_db')
			appState.broadcasting_channel_id = undefined
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	})
</script>

<QueryClientProvider client={queryClient}>
	<svelte:boundary>
		{#await data.preloading}
			<div class="loader">
				<p>{m.app_loading()}</p>
				<r4-loading></r4-loading>
			</div>
		{:then}
			<AuthListener />
			<KeyboardShortcuts />

			{#key uiLocale}
				<div class={['layout', {asideVisible: appState.queue_panel_visible}]} data-locale={uiLocale}>
					<LayoutHeader preloading={data.preloading} />

					<div class="content">
						<main class="scroll">
							{@render children()}
						</main>

						<QueuePanel />

						{#if chatPanelVisible}
							<DraggablePanel title={m.chat_panel_title()}>
								<LiveChat />
							</DraggablePanel>
						{/if}
					</div>

					<LayoutFooter />
				</div>
			{/key}
		{:catch}
			<p>{m.loading_generic()}</p>
		{/await}
	</svelte:boundary>
	<SvelteQueryDevtools buttonPosition="bottom-left" />
</QueryClientProvider>

<style>
	.layout {
		--aside-width: 50vmin;

		display: grid;
		grid-template-rows: auto 1fr auto;
		height: 100vh;
	}

	.content {
		/*display: grid;*/
		/*grid-template-columns: 1fr;*/
		/*overflow: hidden;*/
		/*height: 100%;*/
		/*position: relative;*/

		> :global(aside) {
			position: absolute;
			right: 0;
			top: 0;
			bottom: 0;
			width: 0;
			transform: translate3d(100%, 0, 0);
			transition: transform 1000ms ease-out;
		}
	}

	.asideVisible .content {
		> :global(aside) {
			display: flex;
			transform: translate3d(0, 0, 0);
			transition-duration: 100ms;
			transition-timing-function: ease-in;
			width: 100%;
			max-width: var(--aside-width);
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
		display: flex;
		flex-flow: column;
		text-align: center;
	}
</style>
