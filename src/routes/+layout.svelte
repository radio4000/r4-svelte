<script>
	import '../styles/style.css'
	import {appState} from '$lib/app-state.svelte'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import DeckStrip from '$lib/components/deck-strip.svelte'
	import DeckCompactBar from '$lib/components/deck-compact-bar.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
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

	const repo = __REPO_URL__ || __GIT_INFO__.remoteUrl
	const sha = $derived(__GIT_INFO__.sha)

	let chatPanelVisible = $state(false)
	const rtlLocales = new Set(['ar', 'ur'])
	let anyDeckExpanded = $derived(Object.values(appState.decks).some((deck) => deck.expanded))
	let compactDeckIds = $derived(
		Object.values(appState.decks)
			.filter((deck) => deck.compact)
			.map((deck) => deck.id)
	)

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
			document.documentElement.style.setProperty('--font-family', value)
		} else {
			document.documentElement.style.removeProperty('--font-family')
		}
	})

	// "Close" the database on page unload. I have not noticed any difference, but seems like a good thing to do.
	$effect(() => {
		const handler = async () => {
			log.log('beforeunload_closing_db')
			for (const deck of Object.values(appState.decks)) {
				deck.broadcasting_channel_id = undefined
			}
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
				{#if sha}
					<p class="app-version">
						<a href="{repo}/commit/{sha}" target="_blank" rel="noreferrer">{m.app_version({sha})}</a>
					</p>
				{/if}
			</div>
		{:then}
			<AuthListener />
			<KeyboardShortcuts />
			<ToolTip />

			{#key uiLocale}
				<div class="layout" class:deckExpanded={anyDeckExpanded} data-locale={uiLocale}>
					<LayoutHeader preloading={data.preloading} />

					<div class="content-wrapper">
						<section class="content">
							<div class="scroll-area">
								<main>
									{@render children()}
								</main>
							</div>

							<DeckStrip />
						</section>
						{#if compactDeckIds.length}
							<section class="compact-decks" aria-label="Compact decks">
								{#each compactDeckIds as deckId (deckId)}
									<DeckCompactBar {deckId} />
								{/each}
							</section>
						{/if}
					</div>

					{#if chatPanelVisible}
						<DraggablePanel title={m.chat_panel_title()}>
							<LiveChat />
						</DraggablePanel>
					{/if}
				</div>
			{/key}
		{:catch}
			<p>{m.common_loading()}</p>
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
		margin: 0.25rem 0.5rem 0.5rem;
		font-size: var(--font-2);
		text-align: right;
	}

	.app-version a {
		text-decoration: none;
		color: var(--gray-9);
	}

	.compact-decks {
		display: flex;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border-top: 1px solid var(--gray-5);
		background: var(--header-bg);
		position: sticky;
		bottom: 0;
		z-index: 30;
	}

	.compact-decks:empty {
		display: none;
	}

	.compact-decks :global(.deck-compact-bar) {
		flex: 1;
		min-width: 0;
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

		.compact-decks {
			overflow-x: auto;
			scroll-snap-type: x mandatory;
			padding-inline: 0.25rem;
		}

		.compact-decks :global(.deck-compact-bar) {
			scroll-snap-align: start;
			min-width: 200px;
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
