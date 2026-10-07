<script>
	import '../styles/style.css'
	import {appState, deckAccent} from '$lib/app-state.svelte'
	import {sortedDeckIds} from '$lib/deck'
	import AuthListener from '$lib/components/auth-listener.svelte'
	import DraggablePanel from '$lib/components/draggable-panel.svelte'
	import KeyboardShortcuts from '$lib/components/keyboard-shortcuts.svelte'
	import DeckStrip from '$lib/components/deck-strip.svelte'
	import DeckCompactBar from '$lib/components/deck-compact-bar.svelte'
	import LayoutHeader from '$lib/components/layout-header.svelte'
	import LiveChat from '$lib/components/live-chat.svelte'
	import R4Loading from '$lib/components/r4-loading.svelte'
	import ToolTip from '$lib/components/tool-tip.svelte'
	import EditTrackDialog from '$lib/components/track-edit-dialog.svelte'
	import ShareDialog from '$lib/components/share-dialog.svelte'
	import ShortcutsDialog from '$lib/components/shortcuts-dialog.svelte'
	import AppBuildInfo from '$lib/components/app-build-info.svelte'
	import AppUpdateBanner from '$lib/components/app-update-banner.svelte'
	import {toggleDeckCompact} from '$lib/api'
	import {isMobileViewport} from '$lib/utils'
	import {onMount} from 'svelte'
	import {fly} from 'svelte/transition'
	import {cubicOut} from 'svelte/easing'
	import {SvelteMap, MediaQuery} from 'svelte/reactivity'
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
	import {leaveBroadcast, resyncBroadcastDeck} from '$lib/broadcast.js'
	import {channelsCollection} from '$lib/collections/channels'
	import TracksKeepalive from '$lib/components/tracks-keepalive.svelte'
	import {tracksCollection} from '$lib/collections/tracks'
	import {queuePinTargets} from '$lib/collections/keepalive'
	import {channelPresence} from '$lib/presence.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PresenceCount from '$lib/components/presence-count.svelte'
	import {registerWebMcpTools} from '$lib/webmcp'

	const log = logger.ns('layout').seal()

	/** @type {import('./$types').LayoutProps & {data: {embedMode: boolean}}} */
	const {data, children} = $props()

	// Channels are now fetched on-demand by each page's useLiveQuery (no more fetch-all)

	let chatPanelVisible = $state(false)
	const rtlLocales = new Set(['ar', 'ur'])
	let anyDeckExpanded = $derived(Object.values(appState.decks).some((deck) => deck.expanded))
	let anyDeckActive = $derived(
		Object.values(appState.decks).some(
			(d) =>
				!d.compact &&
				((d.playlist_tracks?.length ?? 0) > 0 ||
					Boolean(d.playlist_track) ||
					Boolean(d.listening_to_channel_id))
		)
	)
	let allDeckIds = $derived(sortedDeckIds(appState.decks))
	let compactDeckIds = $derived(allDeckIds.filter((id) => Boolean(appState.decks[id]?.compact)))
	let compactListeningDeckIds = $derived(
		compactDeckIds.filter((id) => Boolean(appState.decks[id]?.listening_to_channel_id))
	)
	let compactLocalDeckIds = $derived(
		compactDeckIds.filter((id) => !appState.decks[id]?.listening_to_channel_id)
	)
	let compactListeningDecksSynced = $derived(
		compactListeningDeckIds.length > 0 &&
			compactListeningDeckIds.every((id) => !appState.decks[id]?.listening_drifted)
	)
	let compactListenPresenceCount = $derived.by(() => {
		let total = 0
		for (const id of compactListeningDeckIds) {
			const channelId = appState.decks[id]?.listening_to_channel_id
			if (!channelId) continue
			const slug = channelsCollection.state.get(channelId)?.slug
			if (!slug) continue
			total += channelPresence[slug]?.broadcast ?? 0
		}
		return total
	})

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
		// Mobile decks are either compact or expanded. Persisted desktop strip
		// decks (neither flag) normalize to compact once, at load.
		if (isMobileViewport()) {
			for (const deck of Object.values(appState.decks)) {
				if (!deck.compact && !deck.expanded) deck.compact = true
			}
		}
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

	onMount(registerWebMcpTools)

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

	// On mobile, an expanded deck fills the screen like a dialog — desktop keeps
	// decks inline so none of this applies there. A plain app-state flag doesn't
	// participate in browser history, so "back" would leave the deck open and
	// navigate the route underneath it. Push a same-URL dummy history entry while
	// expanded so back pops that entry first; closing the deck any other way
	// (minimize button, ejecting it, Escape) pops the same entry itself so the
	// back stack doesn't accumulate dead entries.
	let deckHistoryPushed = false
	let suppressPopstate = false

	$effect(() => {
		const expanded = anyDeckExpanded
		if (typeof window === 'undefined' || !isMobileViewport()) return
		if (expanded && !deckHistoryPushed) {
			history.pushState({r4DeckExpanded: true}, '', location.href)
			deckHistoryPushed = true
		} else if (!expanded && deckHistoryPushed) {
			deckHistoryPushed = false
			suppressPopstate = true
			history.back()
		}
	})

	onMount(() => {
		function onPopState() {
			if (suppressPopstate) {
				suppressPopstate = false
				return
			}
			if (!deckHistoryPushed) return
			deckHistoryPushed = false
			for (const deck of Object.values(appState.decks)) {
				if (deck.expanded) toggleDeckCompact(deck.id)
			}
		}
		window.addEventListener('popstate', onPopState)
		return () => window.removeEventListener('popstate', onPopState)
	})

	// Theme application
	const prefersLight = new MediaQuery('(prefers-color-scheme: light)')
	const theme = $derived(appState.theme ?? (prefersLight.current ? 'light' : 'dark'))
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
		if (appState.use_pointer_cursor) {
			document.documentElement.style.removeProperty('--interactive-cursor')
		} else {
			document.documentElement.style.setProperty('--interactive-cursor', 'default')
		}
	})

	// Apply floating UI preference — padding/gap for the floating card look.
	// When off, flush the shell but keep --floating-bg / --floating-border so
	// header, decks, and section seams still use the same tokens (one-sided
	// dividers via html.no-floating-ui). Corner rounding stays --border-radius.
	$effect(() => {
		const root = document.documentElement
		const floating = appState.floating_ui !== false
		root.classList.toggle('no-floating-ui', !floating)
		if (floating) {
			root.style.removeProperty('--floating-padding')
			root.style.removeProperty('--floating-gap')
		} else {
			root.style.setProperty('--floating-padding', '0')
			root.style.setProperty('--floating-gap', '0')
		}
		// Never override bg/border tokens — flush mode reuses them for seams.
		root.style.removeProperty('--floating-bg')
		root.style.removeProperty('--floating-border')
	})

	// Apply "Show borders" preference — see html.no-borders in variables.css.
	$effect(() => {
		document.documentElement.classList.toggle('no-borders', appState.show_borders === false)
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
			<EditTrackDialog />
			<ShareDialog />
			<ShortcutsDialog />

			{#each allDeckIds as deckId (deckId)}
				<!-- Two pins per deck — whole queue and current track — that never re-hash
				     together, so one always keeps the playing row resident while the other
				     swaps. The snapshot read (.get) is deliberate — see queuePinTargets(). -->
				{@const queuePin = queuePinTargets(appState.decks[deckId], (id) =>
					tracksCollection.get(id)
				)}
				<TracksKeepalive slugs={queuePin.slugs} ids={queuePin.ids} />
				<TracksKeepalive
					ids={appState.decks[deckId]?.playlist_track
						? [appState.decks[deckId].playlist_track]
						: []}
				/>
			{/each}

			<AppUpdateBanner />

			<div
				class="layout"
				class:deckExpanded={anyDeckExpanded}
				class:deckActive={anyDeckActive}
				data-locale={uiLocale}
			>
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
					<section
						class={['compact-decks', compactDeckIds.length === 0 && 'empty']}
						aria-label={m.decks_compact_label()}
					>
						{#each compactLocalDeckIds as deckId (deckId)}
							<div
								class="compact-deck-item"
								style:--deck-accent={deckAccent(allDeckIds, deckId)}
								transition:fly={{y: 24, duration: 200, easing: cubicOut}}
							>
								<DeckCompactBar {deckId} />
							</div>
						{/each}
						{#if compactListeningDeckIds.length}
							<div class="compact-listening-group">
								<button
									class="compact-group-edge left"
									aria-label={m.broadcasts_leave()}
									onclick={() => compactListeningDeckIds.forEach((id) => leaveBroadcast(id))}
								>
									<Icon icon="close" size={14} />
								</button>
								<div class="compact-listening-list">
									{#each compactListeningDeckIds as deckId (deckId)}
										<div
											class="compact-deck-item"
											style:--deck-accent={deckAccent(allDeckIds, deckId)}
											transition:fly={{y: 24, duration: 200, easing: cubicOut}}
										>
											<DeckCompactBar {deckId} showEdgeControls={false} />
										</div>
									{/each}
								</div>
								<div class="compact-group-actions">
									<button
										class={['compact-group-sync', {active: compactListeningDecksSynced}]}
										aria-label={compactListeningDecksSynced
											? m.decks_compact_sync_live()
											: m.decks_compact_sync_action()}
										onclick={() => compactListeningDeckIds.forEach((id) => resyncBroadcastDeck(id))}
									>
										{#if compactListenPresenceCount > 0}
											<PresenceCount count={compactListenPresenceCount} corner />
										{/if}
										<Icon icon="signal" size={12} />
									</button>
									<button
										class="compact-group-toggle"
										aria-label={m.player_compact_show_panel()}
										onclick={() => toggleDeckCompact(compactListeningDeckIds[0])}
									>
										<Icon icon="deck-panel" expanded />
									</button>
								</div>
							</div>
						{/if}
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
	.layout {
		display: flex;
		flex-direction: row;
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
		padding: var(--floating-padding);
		gap: var(--floating-gap);
	}

	.layout > :global(header) {
		position: sticky;
		top: 0;
		flex-shrink: 0;
		border-radius: var(--border-radius);
		background: var(--floating-bg);
		border: var(--floating-border);
	}

	/* Flush (floating off): elevated panels stay, but only section seams —
	   not a full box around every region. Same --floating-border token. */
	:global(html.no-floating-ui) .layout > :global(header) {
		border: none;
		border-inline-end: var(--floating-border);
	}

	:global(html.no-floating-ui) .compact-deck-item :global(.deck-compact-bar) {
		border: none;
		border-block-start: var(--floating-border);
	}

	.deckExpanded > :global(header) {
		display: none;
	}

	/* Single deck expanded: take full content width */
	.deckExpanded .scroll-area {
		flex: 0 0 0;
		min-width: 0;
		overflow: hidden;
	}

	.deckExpanded :global(.deck-strip) {
		flex: 1 1 auto;
		max-width: none;
		width: auto;
	}

	.content-wrapper {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
		min-height: 0;
		gap: var(--floating-gap);
	}

	/* Plain layout container — not bordered/backgrounded itself, so it doesn't
	   wrap the deck-strip. .scroll-area (the page) is borderless too — every
	   card inside it already has its own border, an outer frame was redundant. */
	.content {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		gap: var(--floating-gap);
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

	/* Plain layout container — each stacked deck is its own floating card (see
	   .compact-deck-item below), same principle as .content/.deck-strip. Each
	   item animates its own enter/exit (transition:fly in the markup), so the
	   container itself doesn't need — and shouldn't also play — an entrance
	   animation of its own (that only ever covered the very first deck). */
	.compact-decks {
		display: flex;
		flex-direction: column;
		gap: var(--floating-gap);
		position: sticky;
		bottom: 0;
		z-index: 30;
	}

	/* Stays mounted (rather than {#if}-removed) even with no compact decks —
	   keeps the {#each} below already-mounted, so the first compact deck of a
	   session gets its fly-in intro like every later one does. */
	.compact-decks.empty {
		display: none;
	}

	.compact-deck-item {
		min-width: 0;
	}

	.compact-deck-item :global(.deck-compact-bar) {
		border-radius: var(--border-radius);
		overflow: hidden;
		background: var(--floating-bg);
		border: var(--floating-border);
	}

	.compact-listening-group {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		column-gap: var(--space-1);
		min-width: 0;
	}

	.compact-listening-list {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.compact-group-edge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--border-radius);
		align-self: center;
		min-height: 2rem;
	}

	.compact-group-edge.left {
		margin-right: 0.05rem;
	}

	.compact-group-actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-1);
		align-self: center;
	}

	.compact-group-sync,
	.compact-group-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-1);
		font-size: var(--font-2);
		white-space: nowrap;
		padding: var(--space-1) var(--space-2);
		min-height: 2rem;
	}

	.compact-group-sync :global(.presence-count) {
		margin-right: 0.05rem;
	}

	.compact-decks :global(.deck-compact-bar) {
		flex: 0 0 auto;
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
			min-height: auto;
			margin: 0;
			width: 100%;
			align-self: stretch;
			order: 2;
			z-index: 40;
			/* Frosted, not solid — the compact player bar sits right above this in the
			   stack, and a translucent/blurred nav reads as a distinct floating layer
			   rather than a flat opaque strip. */
			background: color-mix(in oklch, var(--floating-bg) 75%, transparent);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
		}

		:global(html.no-floating-ui) .layout > :global(header) {
			border: none;
			border-block-start: var(--floating-border);
		}

		.content-wrapper {
			order: 1;
		}

		.content {
			flex-direction: column;
		}

		/* when any deck has visible content, cap page scroll area so decks get most of the viewport */
		.content:has(
				:global(
					.deck-strip
						.deck:not(.compact):is(:not(.hide-video), :not(.listening):not(.auto):not(.hide-queue))
				)
			)
			.scroll-area {
			flex: 0 1 auto;
			max-height: 28dvh;
		}

		/* Non-compact active deck on mobile: hide bottom nav, like expanded on desktop */
		.deckActive > :global(header) {
			display: none;
		}

		.compact-decks {
			position: relative;
			bottom: auto;
		}

		.compact-decks :global(.deck-compact-bar) {
			min-width: 0;
		}

		.compact-group-toggle {
			display: none;
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
