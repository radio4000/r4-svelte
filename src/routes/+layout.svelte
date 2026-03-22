<script>
	import '../styles/style.css'
	import {cubicOut} from 'svelte/easing'
	import {appState, deckAccent} from '$lib/app-state.svelte'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import DeckStrip from '$lib/components/deck-strip.svelte'
	import DeckCompactBar from '$lib/components/deck-compact-bar.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
	import R4Loading from '$lib/components/r4-loading.svelte'
	import ToolTip from '$lib/components/tool-tip.svelte'
	import AppBuildInfo from '$lib/components/app-build-info.svelte'
	import {onMount} from 'svelte'
	import {SvelteMap} from 'svelte/reactivity'
	import {beforeNavigate, afterNavigate, goto} from '$app/navigation'
	import {page} from '$app/state'
	import {DISABLED_ROUTES, DISABLED_ROUTE_FALLBACK} from '$lib/modes'
	import {syncAnalyticsConsent, capture} from '$lib/analytics'
	// import {setChannelsCtx} from '$lib/contexts'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import {logger} from '$lib/logger'
	import * as m from '$lib/paraglide/messages'
	import {getLocale, setLocale, locales, isLocale} from '$lib/paraglide/runtime'
	import {QueryClientProvider} from '@tanstack/svelte-query'
	// import {SvelteQueryDevtools} from '@tanstack/svelte-query-devtools'
	import {queryClient} from '$lib/collections/query-client'
	import {trackAppPresence, untrackAppPresence} from '$lib/presence.svelte'

	const log = logger.ns('layout').seal()

	/** @type {import('./$types').LayoutProps & {data: {embedMode: boolean}}} */
	const {data, children} = $props()

	// Channels are now fetched on-demand by each page's useLiveQuery (no more fetch-all)

	let chatPanelVisible = $state(false)
	const rtlLocales = new Set(['ar', 'ur'])
	let anyDeckExpanded = $derived(Object.values(appState.decks).some((deck) => deck.expanded))
	let allDeckIds = $derived(
		Object.keys(appState.decks)
			.map(Number)
			.sort((a, b) => a - b)
	)
	let compactDeckIds = $derived(
		Object.values(appState.decks)
			.filter((deck) => deck.compact)
			.map((deck) => deck.id)
	)

	/** @param {Element} _node */
	function compactDeckTransition(_node) {
		return {
			duration: 0,
		}
	}

	// Ensure first client render uses persisted locale before any message call runs.
	if (typeof window !== 'undefined') {
		const storedLocale = appState.language
		if (storedLocale && isLocale(storedLocale) && getLocale() !== storedLocale) {
			void setLocale(storedLocale, {reload: false})
		}
	}

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

	// Overwrite on every load — server is authoritative for embed mode
	$effect(() => {
		appState.embed_mode = data.embedMode
		document.documentElement.classList.toggle('embed-mode', data.embedMode)
	})

	onMount(async () => {
		if (DISABLED_ROUTES.some((p) => page.route.id?.startsWith(p))) {
			goto(DISABLED_ROUTE_FALLBACK, {replaceState: true})
		}
		const {registerSW} = await import('virtual:pwa-register')
		registerSW({immediate: true})
		trackAppPresence()
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

	const scrollPositions = new SvelteMap()

	beforeNavigate(({from, to, cancel}) => {
		if (from?.url) {
			const key = from.url.pathname + from.url.search
			scrollPositions.set(key, document.querySelector('.scroll-area')?.scrollTop ?? 0)
		}
		if (to?.url && DISABLED_ROUTES.some((p) => to.route?.id?.startsWith(p))) {
			cancel()
			goto(DISABLED_ROUTE_FALLBACK)
		}
	})

	afterNavigate(({type, to}) => {
		const scrollArea = document.querySelector('.scroll-area')
		if (!scrollArea) return
		if (type === 'popstate' && to?.url) {
			const saved = scrollPositions.get(to.url.pathname + to.url.search)
			scrollArea.scrollTo({top: saved ?? 0})
		} else {
			scrollArea.scrollTo({top: 0})
		}
		capture('$pageview')
	})

	// Theme application
	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const theme = $derived(appState.theme ?? (prefersLight ? 'light' : 'dark'))
	const uiLocale = $derived(appState.language ?? getLocale())

	$effect(() => {
		const isDark = theme === 'dark'
		document.documentElement.classList.toggle('dark', isDark)
		document.documentElement.classList.toggle('light', !isDark)
	})

	$effect(() => {
		if (typeof document === 'undefined') return
		document.documentElement.lang = uiLocale
		document.documentElement.dir = rtlLocales.has(uiLocale) ? 'rtl' : 'ltr'
	})

	$effect(() => {
		applyCustomCssVariables(appState.custom_css_variables)
	})

	// Apply font family
	$effect(() => {
		const ff = appState.font_family
		if (ff) {
			const value = ff.startsWith('var(') ? `${ff}, sans-serif` : `'${ff}', sans-serif`
			document.documentElement.style.setProperty('--font-sans', value)
		} else {
			document.documentElement.style.removeProperty('--font-sans')
		}
	})

	// Sync PostHog opt-in/out with user preference
	$effect(() => {
		syncAnalyticsConsent(appState.analytics_opt_in ?? false)
	})

	// Disabled: all analytics events are anonymous for privacy.
	// $effect(() => {
	// 	const user = appState.user
	// 	if (user) {
	// 		identify(user.id)
	// 	} else {
	// 		reset()
	// 	}
	// })

	// Apply pointer cursor preference
	$effect(() => {
		const value = appState.use_pointer_cursor ? 'pointer' : 'default'
		document.documentElement.style.setProperty('--cursor', value)
	})

	// "Close" the database on page unload. I have not noticed any difference, but seems like a good thing to do.
	$effect(() => {
		const handler = async () => {
			log.log('beforeunload_closing_db')
			untrackAppPresence()
			for (const deck of Object.values(appState.decks)) {
				deck.broadcasting_channel_id = undefined
			}
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	})
</script>

<QueryClientProvider client={queryClient}>
	<svg class="auto-live-gradient-defs" width="0" height="0" aria-hidden="true" focusable="false">
		<defs>
			<linearGradient id="r5-auto-live-gradient" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="var(--accent-8)" />
				<stop offset="0.5" stop-color="var(--accent-11)" />
				<stop offset="1" stop-color="var(--accent-8)" />
				<animateTransform
					attributeName="gradientTransform"
					type="rotate"
					from="0 0.5 0.5"
					to="360 0.5 0.5"
					dur="2.2s"
					repeatCount="indefinite"
				/>
			</linearGradient>
		</defs>
	</svg>
	<svelte:boundary>
		{#await data.preloading}
			<div class="loader">
				<R4Loading />
				<p class="app-version"><AppBuildInfo /></p>
			</div>
		{:then}
			<AuthListener />
			<KeyboardShortcuts />
			<ToolTip />

			<div class="layout" class:deckExpanded={anyDeckExpanded} data-locale={uiLocale}>
				{#if !appState.embed_mode}
					{#key uiLocale}
						<LayoutHeader preloading={data.preloading} />
					{/key}
				{/if}

				<div class="content-wrapper">
					<section class="content">
						<div class="scroll-area">
							{#key uiLocale}
								<main>
									{@render children()}
								</main>
							{/key}
						</div>

						<DeckStrip />
					</section>
					<section class="compact-decks" aria-label={m.decks_compact_label()}>
						{#each compactDeckIds as deckId (deckId)}
							<div
								class="compact-deck-item"
								style:--deck-accent={deckAccent(allDeckIds, deckId)}
								transition:compactDeckTransition
							>
								<DeckCompactBar {deckId} />
							</div>
						{/each}
					</section>
				</div>

				{#if chatPanelVisible}
					<DraggablePanel title={m.chat_panel_title()}>
						<LiveChat />
					</DraggablePanel>
				{/if}
			</div>
		{:catch}
			<p>{m.common_loading()}</p>
		{/await}
	</svelte:boundary>
	<!-- <SvelteQueryDevtools buttonPosition="bottom-left" /> -->
</QueryClientProvider>

<style>
	.auto-live-gradient-defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}

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

	.deckExpanded > :global(header) {
		display: none;
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

	.app-version {
		margin: 0;
		font-size: var(--font-2);
		text-align: center;
	}

	.compact-decks {
		display: flex;
		flex-direction: column;
		gap: 0rem;
		border-radius: 8px 8px 0 0;
		overflow: hidden;
		border-top: 1px solid var(--gray-6);
		/*
		padding: 0.4rem 0.5rem;
		 */
		background: var(--header-bg);
		position: sticky;
		bottom: 0;
		z-index: 30;
	}

	.compact-deck-item {
		min-width: 0;
	}

	.compact-decks:empty {
		display: none;
	}

	.compact-decks :global(.deck-compact-bar) {
		flex: 0 0 auto;
		min-width: 0;
	}

	.compact-deck-item:first-child :global(.deck-compact-bar) {
		border-top: none;
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

		.content {
			flex-direction: column;
		}

		/* when any deck has visible content, cap page scroll area so decks get most of the viewport */
		.content:has(
				:global(
					.deck-strip .deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.hide-queue))
				)
			)
			.scroll-area {
			flex: 0 1 auto;
			max-height: 28dvh;
		}

		.compact-decks {
			position: relative;
			bottom: auto;
		}

		.compact-decks :global(.deck-compact-bar) {
			min-width: 0;
		}
	}

	@media (min-width: 768px) {
		:global(nav hr) {
			margin: 0.5em auto;
			width: 1em;
			height: 1px;
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
		gap: 1rem;
	}

	:global(.r4-loading) {
		display: flex;
		flex-flow: column;
		align-items: center;
		text-align: center;
	}
</style>
