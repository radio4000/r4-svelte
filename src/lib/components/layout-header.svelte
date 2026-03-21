<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
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

	const {preloading} = $props()

	const isSignedIn = $derived(!!appState.user)
	const userChannel = $derived(appState.channel)
	const isBroadcasting = $derived(
		userChannel &&
			Object.values(appState.decks).some((d) => d.broadcasting_channel_id === userChannel.id)
	)
</script>

<header>
	<nav class="nav-secondary">
		<a
			href={resolve('/')}
			class="btn home-link"
			class:active={page.route.id === '/'}
			aria-label={appName}
			{@attach tooltip({content: appName})}
		>
			<IconR4 />
		</a>
		<a
			href={resolve('/channels')}
			class="btn"
			class:active={page.route.id?.startsWith('/channels')}
			aria-label={m.nav_channels()}
			{@attach tooltip({content: m.nav_channels()})}
		>
			<Icon icon={conceptIcons.channels} />
		</a>
		<a
			href={resolve('/search')}
			class="btn"
			class:active={page.route.id?.startsWith('/search')}
			aria-label={m.nav_search()}
			{@attach tooltip({content: m.nav_search()})}
		>
			<Icon icon={conceptIcons.search} />
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
				{#if isBroadcasting}
					<a
						href={resolve(`/${userChannel.slug}`)}
						class="btn ghost broadcasting-btn"
						aria-label={m.status_broadcasting()}
						{@attach tooltip({content: m.status_broadcasting()})}
					>
						<Icon icon="cell-signal" />
					</a>
				{/if}
				<AddTrackDialog />
				<a
					href={resolve(`/${userChannel.slug}`)}
					class="btn channel-link"
					class:broadcasting={isBroadcasting}
					class:active={page.params?.slug === userChannel.slug}
					{@attach tooltip({
						content: isBroadcasting ? m.status_broadcasting() : m.header_go_to_channel()
					})}
				>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
					{#if isBroadcasting}<span class="broadcast-dot"></span>{/if}
				</a>
			{:else if isSignedIn}
				<a
					href={resolve('/create-channel')}
					class="btn"
					class:active={page.route.id?.startsWith('/create-channel')}
					aria-label={m.home_create_channel()}
					{@attach tooltip({content: m.home_create_channel()})}
				>
					<Icon icon="user" />
				</a>
			{/if}
			{#if !isSignedIn}
				<a
					href={resolve('/auth')}
					class="btn"
					class:active={page.route.id?.startsWith('/auth')}
					aria-label={m.auth_create_or_signin()}
					{@attach tooltip({content: m.auth_create_or_signin()})}
				>
					<Icon icon="user" />
				</a>
			{/if}
		{/await}
	</nav>

	<nav class="nav-settings">
		<a
			href={resolve('/history')}
			class="btn"
			class:active={page.route.id === '/history' || page.route.id === '/history/stats'}
			aria-label={m.nav_history()}
			{@attach tooltip({content: m.nav_history()})}
		>
			<Icon icon={conceptIcons.history} />
		</a>
		<a
			href={resolve('/menu')}
			class="btn settings-link"
			class:active={page.route.id?.startsWith('/menu') || page.route.id?.startsWith('/settings')}
			aria-label="Menu"
			{@attach tooltip({content: 'Menu'})}
		>
			<Icon icon={conceptIcons.settings} />
		</a>
		<InternetIndicator href={resolve('/import')} />
	</nav>
</header>

<style>
	header {
		display: flex;
		flex-flow: column nowrap;
		gap: 1rem;
		padding: 0.5rem;
		background: var(--header-bg);
		border-right: 1px solid var(--gray-5);
		z-index: 50;
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

	nav :global(.broadcasting-btn svg) {
		color: var(--accent-9);
	}

	.nav-secondary {
		justify-content: flex-start;
	}

	.home-link {
		padding: 0;
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
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;

		:global(img, svg) {
			width: 100%;
			height: 100%;
			border-radius: calc(var(--border-radius) - 0.15rem);
			object-fit: cover;
		}
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
			align-items: center;
			flex-direction: row;
			border-right: none;
			border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		}

		nav:first-of-type {
			margin-right: auto;
		}

		nav {
			flex-direction: row;
			justify-content: flex-end;
		}

		/* Active indicator: top bar on mobile */
		nav :global(.btn.active) {
			box-shadow:
				lch(0 0 0 / 0.06) 0px 4px 4px -1px,
				lch(0 0 0 / 0.12) 0px 1px 1px 0px,
				inset 0 2px 0 var(--accent-9);
		}
	}
	@media (min-width: 768px) {
		header {
			overflow-y: auto;
		}
	}
</style>
