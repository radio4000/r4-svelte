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
	import {deckAccent} from '$lib/app-state.svelte'

	const {preloading} = $props()

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)
	const isBroadcasting = $derived(
		userChannel &&
			Object.values(appState.decks).some((d) => d.broadcasting_channel_id === userChannel.id)
	)
	const deckIds = $derived(Object.keys(appState.decks).map(Number))
	const activeDeckColor = $derived(deckAccent(deckIds, appState.active_deck_id))

	const DESKTOP_MIN = 1
	const DESKTOP_MAX = 10000
	const DESKTOP_DEFAULT = 188
	const MOBILE_MIN = 52
	const MOBILE_MAX = 92
	const MOBILE_DEFAULT = 90
	const STORAGE_KEY_LABELS_VISIBLE = 'r5:layout-header-labels-visible'

	let isMobileViewport = $state(false)
	let headerSize = $state(DESKTOP_DEFAULT)
	let labelsVisible = $state(true)
	let labelLayout = $state(/** @type {'none' | 'right' | 'below'} */ ('none'))

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value))
	}

	function sizeBounds(mobile) {
		return mobile ? [MOBILE_MIN, MOBILE_MAX] : [DESKTOP_MIN, DESKTOP_MAX]
	}

	function detectMobileViewport() {
		return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	}

	function applyModeFromSize() {
		if (!labelsVisible) labelLayout = 'none'
		else labelLayout = isMobileViewport ? 'below' : 'right'
	}

	function loadSizeForViewport(mobile) {
		const [min, max] = sizeBounds(mobile)
		const fallback = mobile ? MOBILE_DEFAULT : DESKTOP_DEFAULT
		headerSize = clamp(fallback, min, max)
		applyModeFromSize()
	}

	function persistLabelsVisible() {
		if (typeof localStorage === 'undefined') return
		localStorage.setItem(STORAGE_KEY_LABELS_VISIBLE, labelsVisible ? '1' : '0')
	}

	function toggleLabels() {
		labelsVisible = !labelsVisible
		applyModeFromSize()
		persistLabelsVisible()
	}

	onMount(() => {
		isMobileViewport = detectMobileViewport()
		const stored =
			typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_LABELS_VISIBLE) : null
		labelsVisible = stored == null ? true : stored === '1'
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
	style={`--app-header-size:${headerSize}px;`}
	ondblclick={toggleLabels}
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
			href={resolve('/explore')}
			class="btn nav-btn"
			class:active={page.route.id?.startsWith('/explore') ||
				page.route.id?.startsWith('/channels') ||
				page.route.id?.startsWith('/tracks') ||
				page.route.id?.startsWith('/tags') ||
				page.route.id?.startsWith('/feed')}
			aria-label={m.nav_explore()}
			{@attach tooltip({content: m.nav_explore()})}
		>
			<Icon icon={conceptIcons.channels} />
			<span class="btn-label">{m.nav_explore()}</span>
		</a>
	</nav>

	<!-- <nav class="pins">
		<PinsNav />
	</nav> -->

	<nav class="user-nav">
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
						href={resolve('/broadcast')}
						class="btn ghost broadcasting-btn nav-btn"
						aria-label={m.status_broadcasting()}
						{@attach tooltip({content: m.status_broadcasting()})}
					>
						<Icon icon="signal" />
						<span class="btn-label">{m.status_live_short()}</span>
					</a>
				{/if}
			{:else if isSignedIn}
				<a
					href={resolve('/create-channel')}
					class="btn nav-btn"
					class:active={page.route.id?.startsWith('/create-channel')}
					aria-label={m.nav_channels()}
					{@attach tooltip({content: m.nav_channels()})}
				>
					<Icon icon="user" />
					<span class="btn-label">{m.nav_channels()}</span>
				</a>
			{/if}
			{#if !isSignedIn}
				<a
					href={resolve('/auth')}
					class="btn nav-btn"
					class:active={page.route.id?.startsWith('/auth')}
					aria-label={m.nav_sign_in()}
					{@attach tooltip({content: m.nav_sign_in()})}
				>
					<Icon icon="user" />
					<span class="btn-label">{m.nav_sign_in()}</span>
				</a>
			{/if}
		{/await}
	</nav>

	<nav class="nav-settings">
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
</header>

<style>
	header {
		--app-nav-btn-size: clamp(2.05rem, calc(var(--app-header-size) * 0.34), 3.3rem);
		--app-nav-glyph-size: clamp(0.88rem, calc(var(--app-nav-btn-size) * 0.42), 1.32rem);
		--app-nav-gap: 0.34rem;
		--app-nav-pad-inline: clamp(0.4rem, calc(var(--app-nav-btn-size) * 0.17), 0.62rem);
		--app-nav-pad-block: clamp(0rem, calc(var(--app-nav-btn-size) * 0.06), 0.18rem);
		display: flex;
		flex-flow: column nowrap;
		gap: clamp(0.3rem, calc(var(--app-nav-btn-size) * 0.2), 0.8rem);
		padding: 0.4rem 0.35rem;
		inline-size: clamp(min-content, var(--app-header-size), max-content);
		min-inline-size: min-content;
		max-inline-size: max-content;
		background: var(--color-interface);
		border-right: 1px solid var(--gray-4);
		border-radius: var(--border-radius);
		z-index: 50;
		position: relative;
		overflow: visible;
	}

	nav {
		flex-direction: column;
		margin: 0;

		@media (min-width: 768px) {
			/* vertical version has more space */
			gap: 0.3rem;
		}
	}

	nav :global(.btn svg) {
		color: currentColor;
	}

	nav :global(.broadcasting-btn svg) {
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
		height: auto;
		width: auto;
		margin: 0;
		padding: var(--app-nav-pad-block) var(--app-nav-pad-inline);
		gap: var(--app-nav-gap);
		border-color: transparent;
		background: transparent;
		box-shadow: none;
		transition:
			min-width 120ms ease,
			min-height 120ms ease,
			padding 120ms ease;
	}

	nav :global(.btn.nav-btn .btn-label) {
		display: block;
		font-size: var(--font-3);
		max-width: 10ch;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-nav {
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

	/* Active menu item: no accent color, only interface background */
	nav :global(.btn.active) {
		color: inherit;
		background: var(--color-interface-elevated);
		border-color: transparent;
		box-shadow: none;
	}

	nav :global(.btn.active svg) {
		color: var(--accent-9);
	}

	@media (max-width: 768px) {
		nav :global(.btn.nav-btn) {
			min-height: var(--app-nav-btn-size);
		}

		header {
			--app-nav-btn-size: calc(var(--app-header-size) * 0.58);
			align-items: center;
			flex-direction: row;
			justify-content: space-between;
			gap: 0.4rem;
			padding: 0.3rem 0.5rem 0.55rem;
			inline-size: 100%;
			width: 100%;
			min-inline-size: 100%;
			min-width: 100%;
			max-inline-size: none;
			block-size: auto;
			min-block-size: auto;
			max-block-size: none;
			box-sizing: border-box;
			border: none;
			border-top: 1px solid var(--gray-4);
			border-radius: 0;
		}

		nav:first-of-type {
			flex: 0 0 auto;
			justify-content: flex-start;
		}

		.nav-settings {
			flex: 0 0 auto;
			justify-content: flex-end;
		}

		nav {
			flex-direction: row;
			flex: 0 0 auto;
			justify-content: flex-start;
			gap: 0.2rem;
		}

		.user-nav {
			margin: 0;
			flex: 1;
			justify-content: center;
			overflow-x: auto;
			scrollbar-width: none;
		}

		/* Active menu item keeps same style on mobile */
		nav :global(.btn.active) {
			color: inherit;
			background: var(--color-interface-elevated);
			border-color: transparent;
			box-shadow: none;
		}
	}
</style>
