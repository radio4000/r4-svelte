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
	import R4Loading from '$lib/components/r4-loading.svelte'
	import ToolTip from '$lib/components/tool-tip.svelte'
	import {onMount} from 'svelte'
	import {setChannelsCtx} from '$lib/contexts'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import {logger} from '$lib/logger'
	import * as m from '$lib/paraglide/messages'
	import {getLocale, setLocale, locales, isLocale} from '$lib/paraglide/runtime'
	import {QueryClientProvider} from '@tanstack/svelte-query'
	// import {SvelteQueryDevtools} from '@tanstack/svelte-query-devtools'
	import {queryClient, channelsCollection} from '$lib/tanstack/collections'
	import {useLiveQuery} from '@tanstack/svelte-db'

	const log = logger.ns('layout').seal()

	/** @type {import('./$types').LayoutProps} */
	const {data, children} = $props()

	// Query channels once at layout level, share via context
	// Defer useLiveQuery until after preloading to avoid state_unsafe_mutation during hydration
	const channelsQuery = useLiveQuery((q) => q.from({channels: channelsCollection}))
	let channels = $derived(channelsQuery?.data || [])
	setChannelsCtx(() => channels)

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
				<R4Loading />
			</div>
		{:then}
			<AuthListener />
			<KeyboardShortcuts />
			<ToolTip />

			{#key uiLocale}
				<div
					class={['layout', {asideVisible: appState.queue_panel_visible}]}
					data-locale={uiLocale}
					style:--queue-panel-width={appState.queue_panel_width ? `${appState.queue_panel_width}px` : null}
				>
					<LayoutHeader preloading={data.preloading} />

					<div class="content-wrapper">
						<section class="content">
							<div class="scroll-area">
								<main>
									{@render children()}
								</main>
							</div>

							<QueuePanel />
						</section>

						<LayoutFooter />
					</div>

					{#if chatPanelVisible}
						<DraggablePanel title={m.chat_panel_title()}>
							<LiveChat />
						</DraggablePanel>
					{/if}
				</div>
			{/key}
		{:catch}
			<p>{m.loading_generic()}</p>
		{/await}
	</svelte:boundary>
	<!-- <SvelteQueryDevtools buttonPosition="bottom-left" /> -->
</QueryClientProvider>

<style>
	.layout {
		display: flex;
		flex-direction: row;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
	}

	.layout > :global(header) {
		position: sticky;
		top: 0;
		height: 100dvh;
		flex-shrink: 0;
	}

	.content-wrapper {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.content {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.scroll-area {
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: thin;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.content > :global(aside) {
		display: none;
		width: var(--queue-panel-width, 400px);
		flex-shrink: 0;
	}

	.asideVisible .content > :global(aside) {
		display: flex;
	}

	@media (max-width: 768px) {
		.layout {
			flex-direction: column;
		}

		.layout > :global(header) {
			position: sticky;
			top: 0;
			height: auto;
		}

		.asideVisible .content {
			flex-direction: column;
		}

		.asideVisible .scroll-area {
			display: none;
		}

		.asideVisible .content > :global(aside) {
			position: static;
			inset: auto;
			width: 100%;
			height: 100%;
			z-index: 100;
		}
	}

	.loader {
		height: 100dvh;
		display: flex;
		flex-flow: column;
		place-content: center;
		place-items: center;
		max-width: 40ch;
		margin: 0 auto;
	}

	:global(.r4-loading) {
		display: flex;
		flex-flow: column;
		text-align: center;
	}
</style>
