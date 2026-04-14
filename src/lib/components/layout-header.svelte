<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {onMount} from 'svelte'
	import {appState} from '$lib/app-state.svelte'
	import AddTrackDialog from '$lib/components/track-add-dialog.svelte'
	import EditTrackDialog from '$lib/components/track-edit-dialog.svelte'
	import ShareDialog from '$lib/components/share-dialog.svelte'
	import ShortcutsDialog from '$lib/components/shortcuts-dialog.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import InternetIndicator from '$lib/components/internet-indicator.svelte'
	import * as m from '$lib/paraglide/messages'
	import {appName, conceptIcons} from '$lib/config'
	import {findAutoDecksForChannel} from '$lib/deck'
	import {deckAccent} from '$lib/app-state.svelte'

	const {preloading} = $props()

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)
	const isBroadcasting = $derived(
		userChannel &&
			Object.values(appState.decks).some((d) => d.broadcasting_channel_id === userChannel.id)
	)
	const autoDecks = $derived(findAutoDecksForChannel(appState.decks, userChannel?.slug))
	const isAutoRadio = $derived(autoDecks.length > 0)
	const deckIds = $derived(Object.keys(appState.decks).map(Number))
	const activeDeckColor = $derived(deckAccent(deckIds, appState.active_deck_id))

	const DESKTOP_MIN = 1
	const DESKTOP_MAX = 10000
	const DESKTOP_DEFAULT = 84
	const DESKTOP_LABEL_BELOW_THRESHOLD = 104
	const DESKTOP_LABEL_RIGHT_THRESHOLD = 168
	const MOBILE_MIN = 52
	const MOBILE_MAX = 120
	const MOBILE_DEFAULT = 78
	const MOBILE_LABEL_BELOW_THRESHOLD = 80
	const MOBILE_LABEL_RIGHT_THRESHOLD = 108
	const STORAGE_KEY_DESKTOP = 'r5:layout-header-size:desktop'
	const STORAGE_KEY_MOBILE = 'r5:layout-header-size:mobile'

	let isMobileViewport = $state(false)
	let headerSize = $state(DESKTOP_DEFAULT)
	let labelLayout = $state(/** @type {'none' | 'right' | 'below'} */ ('none'))
	let resizing = $state(false)

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value))
	}

	function sizeBounds(mobile) {
		return mobile ? [MOBILE_MIN, MOBILE_MAX] : [DESKTOP_MIN, DESKTOP_MAX]
	}

	function storageKey(mobile) {
		return mobile ? STORAGE_KEY_MOBILE : STORAGE_KEY_DESKTOP
	}

	function detectMobileViewport() {
		return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	}

	function applyModeFromSize() {
		if (isMobileViewport) {
			if (headerSize >= MOBILE_LABEL_RIGHT_THRESHOLD) {
				labelLayout = 'right'
				return
			}
			labelLayout = headerSize >= MOBILE_LABEL_BELOW_THRESHOLD ? 'below' : 'none'
			return
		}
		if (headerSize >= DESKTOP_LABEL_RIGHT_THRESHOLD) {
			labelLayout = 'right'
			return
		}
		if (headerSize >= DESKTOP_LABEL_BELOW_THRESHOLD) {
			labelLayout = 'below'
			return
		}
		labelLayout = 'none'
	}

	function loadSizeForViewport(mobile) {
		const [min, max] = sizeBounds(mobile)
		const fallback = mobile ? MOBILE_DEFAULT : DESKTOP_DEFAULT
		const raw =
			typeof localStorage !== 'undefined' ? Number(localStorage.getItem(storageKey(mobile))) : NaN
		headerSize = Number.isFinite(raw) ? clamp(raw, min, max) : fallback
		applyModeFromSize()
	}

	function persistSize() {
		if (typeof localStorage === 'undefined') return
		localStorage.setItem(storageKey(isMobileViewport), String(Math.round(headerSize)))
	}

	function handleResizeStart(event) {
		event.preventDefault()
		const startPointer = isMobileViewport ? event.clientY : event.clientX
		const startSize = headerSize
		const [min, max] = sizeBounds(isMobileViewport)
		resizing = true

		const handleMove = (moveEvent) => {
			const currentPointer = isMobileViewport ? moveEvent.clientY : moveEvent.clientX
			const delta = currentPointer - startPointer
			headerSize = clamp(startSize + delta, min, max)
			applyModeFromSize()
		}

		const stop = () => {
			resizing = false
			persistSize()
			window.removeEventListener('pointermove', handleMove)
			window.removeEventListener('pointerup', stop)
			window.removeEventListener('pointercancel', stop)
		}

		window.addEventListener('pointermove', handleMove)
		window.addEventListener('pointerup', stop)
		window.addEventListener('pointercancel', stop)
	}

	onMount(() => {
		isMobileViewport = detectMobileViewport()
		loadSizeForViewport(isMobileViewport)
		const onViewportResize = () => {
			const nextMobile = detectMobileViewport()
			if (nextMobile !== isMobileViewport) {
				isMobileViewport = nextMobile
				loadSizeForViewport(nextMobile)
			}
		}
		window.addEventListener('resize', onViewportResize)
		return () => window.removeEventListener('resize', onViewportResize)
	})
</script>

<header
	class:labels-none={labelLayout === 'none'}
	class:labels-right={labelLayout === 'right'}
	class:labels-below={labelLayout === 'below'}
	class:mobile={isMobileViewport}
	class:resizing
	style={`--app-header-size:${headerSize}px;`}
>
	<nav class="nav-secondary">
		<a
			href={resolve('/')}
			class="btn home-link nav-btn"
			class:active={page.route.id === '/'}
			aria-label={appName}
			style:color={activeDeckColor}
			{@attach tooltip({content: appName})}
		>
			<IconR4 />
			<span class="btn-label">Home</span>
		</a>
		<a
			href={resolve('/search')}
			class="btn nav-btn"
			class:active={page.route.id?.startsWith('/search')}
			aria-label={m.nav_search()}
			{@attach tooltip({content: m.nav_search()})}
		>
			<Icon icon={conceptIcons.search} />
			<span class="btn-label">{m.nav_search()}</span>
		</a>
	</nav>

	<!-- <nav class="pins">
		<PinsNav />
	</nav> -->

	<nav class="user">
		{#await preloading then}
			<EditTrackDialog />
			<ShareDialog />
			<ShortcutsDialog />
			{#if userChannel}
				<AddTrackDialog class="nav-btn" label="Add" />
				<a
					href={resolve(`/${userChannel.slug}`)}
					class={[
						'btn',
						'nav-btn',
						'channel-link',
						{broadcasting: isBroadcasting, active: page.params?.slug === userChannel.slug}
					]}
					{@attach tooltip({
						content: isBroadcasting ? m.status_broadcasting() : m.header_go_to_channel()
					})}
				>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
					{#if isBroadcasting}<span class="broadcast-dot"></span>{/if}
					<span class="btn-label channel-slug-label">@{userChannel.slug}</span>
				</a>
				{#if isBroadcasting}
					<a
						href={resolve(`/${userChannel.slug}`)}
						class="btn ghost broadcasting-btn nav-btn"
						aria-label={m.status_broadcasting()}
						{@attach tooltip({content: m.status_broadcasting()})}
					>
						<Icon icon="signal" />
						<span class="btn-label">{m.status_live_short()}</span>
					</a>
				{/if}
				{#if isAutoRadio}
					<a
						href={resolve(`/${userChannel.slug}`)}
						class="btn ghost auto-btn nav-btn"
						aria-label={m.auto_radio_join()}
						{@attach tooltip({content: m.auto_radio_join()})}
					>
						<Icon icon="infinite" />
						<span class="btn-label">Auto</span>
					</a>
				{/if}
			{:else if isSignedIn}
				<a
					href={resolve('/create-channel')}
					class="btn nav-btn"
					class:active={page.route.id?.startsWith('/create-channel')}
					aria-label={m.home_create_channel()}
					{@attach tooltip({content: m.home_create_channel()})}
				>
					<Icon icon="user" />
					<span class="btn-label">{m.home_create_channel()}</span>
				</a>
			{/if}
			{#if !isSignedIn}
				<a
					href={resolve('/auth')}
					class="btn nav-btn"
					class:active={page.route.id?.startsWith('/auth')}
					aria-label={m.auth_create_or_signin()}
					{@attach tooltip({content: m.auth_create_or_signin()})}
				>
					<Icon icon="user" />
					<span class="btn-label">{m.auth_create_or_signin()}</span>
				</a>
			{/if}
		{/await}
	</nav>

	<nav class="nav-settings">
		<a
			href={resolve('/history')}
			class="btn nav-btn"
			class:active={page.route.id === '/history' || page.route.id === '/history/stats'}
			aria-label={m.nav_history()}
			{@attach tooltip({content: m.nav_history()})}
		>
			<Icon icon={conceptIcons.history} />
			<span class="btn-label">{m.nav_history()}</span>
		</a>
		<a
			href={resolve('/menu')}
			class="btn settings-link nav-btn"
			class:active={page.route.id?.startsWith('/menu') || page.route.id?.startsWith('/settings')}
			aria-label="Menu"
			{@attach tooltip({content: 'Menu'})}
		>
			<Icon icon="menu" />
			<span class="btn-label">Menu</span>
		</a>
		<InternetIndicator href={resolve('/import')} />
	</nav>
	<div
		class="header-resize-handle"
		role="separator"
		aria-label="Resize app menu"
		aria-orientation={isMobileViewport ? 'horizontal' : 'vertical'}
		onpointerdown={handleResizeStart}
	></div>
</header>

<style>
	header {
		--app-nav-btn-size: clamp(2.05rem, calc(var(--app-header-size) * 0.34), 3.3rem);
		--app-nav-glyph-size: clamp(0.88rem, calc(var(--app-nav-btn-size) * 0.42), 1.32rem);
		--app-nav-gap: 0.34rem;
		display: flex;
		flex-flow: column nowrap;
		gap: 1rem;
		padding: 0.3rem;
		inline-size: clamp(min-content, var(--app-header-size), max-content);
		min-inline-size: min-content;
		max-inline-size: max-content;
		background: var(--header-bg);
		border-right: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		z-index: 50;
		position: relative;
		overflow: visible;
	}

	nav {
		flex-direction: column;

		@media (min-width: 768px) {
			/* vertical version has more space */
			gap: 0.3rem;
		}
	}

	nav :global(.btn svg) {
		color: currentColor;
	}

	nav :global(.broadcasting-btn svg),
	nav :global(.auto-btn svg) {
		color: var(--accent-9);
	}

	.nav-secondary {
		justify-content: flex-start;
	}

	.home-link:not(.nav-btn) {
		padding: 0;
	}

	nav :global(.btn.nav-btn) {
		min-width: var(--app-nav-btn-size);
		min-height: var(--app-nav-btn-size);
		height: auto;
		width: auto;
		padding: 0.26rem 0.38rem;
		gap: var(--app-nav-gap);
		transition:
			min-width 120ms ease,
			min-height 120ms ease,
			padding 120ms ease;
	}

	nav :global(.btn.nav-btn .btn-label) {
		display: block;
		max-width: 10ch;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user {
		margin-top: auto;
		margin-bottom: auto;
	}

	.broadcast-dot {
		position: absolute;
		top: -7px;
		right: -5px;
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		background: var(--accent-9);
	}

	.btn:has(.broadcast-dot) {
		position: relative;
	}

	.channel-link {
		padding: 0.15rem;
		overflow: hidden;
		flex-shrink: 0;

		:global(img, .fallback) {
			flex: none;
		}

		:global(img, .fallback, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.15rem);
			object-fit: cover;
		}
	}

	nav :global(.btn.nav-btn svg) {
		width: var(--app-nav-glyph-size);
		height: var(--app-nav-glyph-size);
	}

	.channel-link:not(.nav-btn) {
		width: 2rem;
		height: 2rem;
	}

	.channel-link.nav-btn {
		padding: 0.2rem 0.32rem 0.25rem;
		--channel-avatar-size: var(--app-nav-glyph-size);

		:global(img, .fallback, svg) {
			width: var(--channel-avatar-size);
			height: var(--channel-avatar-size);
			min-width: var(--channel-avatar-size);
			min-height: var(--channel-avatar-size);
			aspect-ratio: 1;
		}
	}

	.channel-slug-label {
		max-width: 8ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	header.labels-none :global(.btn.nav-btn .btn-label) {
		display: none;
	}

	header.labels-below :global(.btn.nav-btn) {
		flex-direction: column;
	}

	header.labels-right :global(.btn.nav-btn) {
		flex-direction: row;
		justify-content: flex-start;
		min-width: min(100%, calc(var(--app-header-size) - 0.55rem));
	}

	header.labels-right nav :global(.btn.nav-btn .btn-label) {
		text-align: left;
		max-width: none;
	}

	/* Active indicator: left bar on desktop instead of background fill */
	nav :global(.btn.active) {
		color: var(--accent-9);
		box-shadow:
			lch(0 0 0 / 0.06) 0px 4px 4px -1px,
			lch(0 0 0 / 0.12) 0px 1px 1px 0px,
			inset 2px 0 0 var(--accent-9);
	}

	@media (max-width: 768px) {
		header {
			--app-nav-btn-size: clamp(2.05rem, calc(var(--app-header-size) * 0.42), 3.4rem);
			align-items: center;
			flex-direction: row;
			border-right: none;
			border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
			inline-size: 100%;
			width: 100%;
			block-size: clamp(min-content, var(--app-header-size), max-content);
			min-block-size: min-content;
			max-block-size: max-content;
			box-sizing: border-box;
		}

		nav:first-of-type {
			flex: 1;
			justify-content: flex-start;
		}

		.nav-settings {
			flex: 1;
			justify-content: flex-end;
		}

		nav {
			flex-direction: row;
			justify-content: flex-end;
		}

		header.labels-none nav :global(.btn.nav-btn) {
			min-width: var(--app-nav-btn-size);
			min-height: var(--app-nav-btn-size);
			padding-inline: 0.3rem;
		}

		/* Active indicator: top bar on mobile */
		nav :global(.btn.active) {
			box-shadow:
				lch(0 0 0 / 0.06) 0px 4px 4px -1px,
				lch(0 0 0 / 0.12) 0px 1px 1px 0px,
				inset 0 2px 0 var(--accent-9);
		}
	}

	.header-resize-handle {
		position: absolute;
		top: 0;
		right: -4px;
		width: 8px;
		height: 100%;
		cursor: ew-resize;
		z-index: 2;
	}

	@media (max-width: 768px) {
		.header-resize-handle {
			left: 0;
			right: 0;
			top: auto;
			bottom: -4px;
			width: 100%;
			height: 8px;
			cursor: ns-resize;
		}
	}
</style>
