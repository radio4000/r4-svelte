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
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {broadcastsCollection} from '$lib/collections/broadcasts'
	import PinsNav from '$lib/components/pins-nav.svelte'
	import {resyncAutoRadio} from '$lib/api'
	import * as m from '$lib/paraglide/messages'

	const {preloading} = $props()

	const userChannel = $derived(appState.channel)
	const isBroadcasting = $derived(
		userChannel && Object.values(appState.decks).some((d) => d.broadcasting_channel_id === userChannel.id)
	)
	const userChannelAutoDecks = $derived.by(() => {
		if (!userChannel?.slug) return []
		return Object.values(appState.decks).filter(
			(d) => d.auto_radio && (d.view?.channels?.[0] === userChannel.slug || d.playlist_slug === userChannel.slug)
		)
	})
	const userChannelHasAuto = $derived(userChannelAutoDecks.length > 0)
	const userChannelHasAutoDrifted = $derived(userChannelAutoDecks.some((d) => d.auto_radio_drifted))
	const userChannelResyncDeckId = $derived.by(() => {
		if (!userChannel?.slug || !userChannelHasAuto) return undefined
		const activeDeck = appState.decks[appState.active_deck_id]
		if (
			activeDeck?.id &&
			activeDeck.auto_radio &&
			(activeDeck.view?.channels?.[0] === userChannel.slug || activeDeck.playlist_slug === userChannel.slug)
		) {
			return activeDeck.id
		}
		return userChannelAutoDecks[0]?.id
	})

	const broadcasts = useLiveQuery(broadcastsCollection)
	const broadcastCount = $derived(broadcasts.data?.length ?? 0)
</script>

<header>
	<nav class="nav-secondary">
		<a href={resolve('/')} class="btn home-link" class:active={page.route.id === '/'} aria-label={m.app_name()}>
			<IconR4 />
		</a>
		<a
			href={resolve('/search')}
			class="btn"
			class:active={page.route.id === '/search'}
			aria-label={m.nav_search()}
			{@attach tooltip({content: m.nav_search()})}
		>
			<Icon icon="search" />
		</a>
		<a
			href={resolve('/broadcasts')}
			class="btn"
			class:active={page.route.id === '/broadcasts'}
			aria-label={m.nav_broadcasts()}
			{@attach tooltip({content: m.nav_broadcasts()})}
		>
			<Icon icon="cell-signal" />
			{#if broadcastCount > 0}
				<span class="count">{broadcastCount}</span>
			{/if}
		</a>

		{#await preloading then}
			{#if !userChannel}
				<a
					href={resolve('/welcome')}
					class="btn"
					class:active={page.route.id === '/welcome'}
					{@attach tooltip({content: 'Start your radio'})}
				>
					<Icon icon="sparkles" />
				</a>
			{/if}
		{/await}
	</nav>

	<nav class="pins">
		<PinsNav />
	</nav>

	<nav class="user">
		{#await preloading then}
				{#if userChannelHasAuto}
					<button
						type="button"
						class="btn resync-link"
						class:ghost={!userChannelHasAutoDrifted}
						onclick={() => userChannelResyncDeckId && resyncAutoRadio(userChannelResyncDeckId)}
						{@attach tooltip({content: m.auto_radio_resync()})}
					>
						<Icon icon="infinite" />
				</button>
			{/if}
			<AddTrackDialog />
			<EditTrackDialog />
			<ShareDialog />
			<ShortcutsDialog />
			{#if userChannel}
				<a
					href={resolve(`/${userChannel.slug}`)}
					class="btn channel-link"
					class:broadcasting={isBroadcasting}
					class:active={userChannelHasAuto}
					{@attach tooltip({content: isBroadcasting ? 'Broadcasting' : 'Go to your channel'})}
				>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
					{#if isBroadcasting}<span class="broadcast-dot"></span>{/if}
					{#if userChannelHasAuto}<span class="auto-dot" class:drifted={userChannelHasAutoDrifted}></span>{/if}
				</a>
			{:else}{/if}
		{/await}
		<a
			href={resolve('/settings')}
			class="btn settings-link"
			class:active={page.route.id?.startsWith('/settings')}
			aria-label={m.nav_settings()}
			{@attach tooltip({content: m.nav_settings()})}
		>
			<Icon icon="settings" />
		</a>
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
	}

	nav :global(.btn svg) {
		color: currentColor;
	}

	.nav-secondary {
		justify-content: flex-start;
	}

	nav.pins {
		flex: 1;
		justify-content: center;
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

	.auto-dot {
		position: absolute;
		bottom: -4px;
		right: -4px;
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--accent-9);
	}

	.auto-dot.drifted {
		background: var(--red-9, #e53e3e);
	}

	.btn:has(.auto-dot) {
		position: relative;
	}

	.channel-link {
		padding: 0;
		height: 30px;
		overflow: visible;
		max-width: 42px;
		padding: 1px;
		@media (min-width: 768px) {
			height: auto;
		}
		@media (max-width: 768px) {
			min-width: var(--track-artwork-size);
			height: 32px;
		}
	}

	.count {
		position: absolute;
		top: -7px;
		right: -5px;
		background: var(--accent-9);
		color: var(--gray-1);
		border-radius: 50%;
		font-size: var(--font-1);
		min-width: 1.2rem;
		height: 1.2rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn:has(.count) {
		position: relative;
	}

	/* Active indicator: left bar on desktop instead of background fill */
	nav :global(.btn.active) {
		color: var(--accent-9);
		box-shadow:
			lch(0 0 0 / 0.06) 0px 4px 4px -1px,
			lch(0 0 0 / 0.12) 0px 1px 1px 0px,
			inset 3px 0 0 var(--accent-9);
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

		.settings-link {
			margin-top: 0;
		}

		/* Active indicator: top bar on mobile */
		nav :global(.btn.active) {
			box-shadow:
				lch(0 0 0 / 0.06) 0px 4px 4px -1px,
				lch(0 0 0 / 0.12) 0px 1px 1px 0px,
				inset 0 3px 0 var(--accent-9);
		}
	}
	@media (min-width: 768px) {
		/* Square buttons when vertical */
		nav :global(.btn) {
			aspect-ratio: 1/1;
		}
	}
</style>
