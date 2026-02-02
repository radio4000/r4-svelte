<script>
	import {page} from '$app/state'
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
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const {preloading} = $props()

	const userChannel = $derived(appState.channel)

	const broadcasts = useLiveQuery(broadcastsCollection)
	const broadcastCount = $derived(broadcasts.data?.length ?? 0)
</script>

<header>
	<nav>
		<a href="/" class="btn home-link" class:active={page.route.id === '/'} aria-label={m.app_name()}>
			<IconR4 size={20} />
		</a>
		<a
			href="/search"
			class="btn"
			class:active={page.route.id === '/search'}
			{@attach tooltip({content: m.nav_search()})}
		>
			<Icon icon="search" size={20} />
		</a>
		<a
			href="/broadcasts"
			class="btn"
			class:active={page.route.id === '/broadcasts'}
			{@attach tooltip({content: m.nav_broadcasts()})}
		>
			<Icon icon="signal" size={20} />
			{#if broadcastCount > 0}
				<span class="count">{broadcastCount}</span>
			{/if}
		</a>
	</nav>

	<nav>
		{#await preloading then}
			<AddTrackDialog />
			<EditTrackDialog />
			<ShareDialog />
			<ShortcutsDialog />
			{#if userChannel}
				<a href="/{userChannel.slug}" class="btn channel-link" {@attach tooltip({content: 'Go to your channel'})}>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
				</a>
			{/if}
		{/await}
		<a
			href="/settings"
			class="btn settings-link"
			class:active={page.route.id?.startsWith('/settings')}
			{@attach tooltip({content: m.nav_settings()})}
		>
			<Icon icon="settings" size={20} />
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

	nav:has(.settings-link) {
		flex: 1;
	}

	.channel-link {
		padding: 0;
		height: 30px;
		overflow: hidden;
		max-width: 42px;
		padding: 1px;
		@media (min-width: 768px) {
			height: auto;
		}
		@media (max-width: 768px) {
			max-width: 37px;
		}
	}

	.count {
		position: absolute;
		top: -7px;
		right: -5px;
		background: var(--color-red);
		color: white;
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
	}

	@media (min-width: 768px) {
		/* Square buttons when vertical */
		nav :global(.btn) {
			aspect-ratio: 1/1;
		}
	}
</style>
