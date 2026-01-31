<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import AddTrackModal from '$lib/components/track-add-modal.svelte'
	import EditTrackModal from '$lib/components/track-edit-modal.svelte'
	import ShareModal from '$lib/components/share-modal.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
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
	</nav>

	<nav>
		{#await preloading then}
			<AddTrackModal />
			<EditTrackModal />
			<ShareModal />
			{#if userChannel}
				<a href="/{userChannel.slug}" class="btn channel-link" {@attach tooltip({content: 'Go to your channel'})}>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
				</a>
			{/if}
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

	.home-link {
	}

	.channel-link {
		padding: 0;
		height: 30px;
		overflow: hidden;
		max-width: 42px;
		@media (max-width: 768px) {
			/*max-width: 30px;*/
		}
	}

	.settings-link {
		margin-top: auto;
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
</style>
