<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import AddTrackModal from '$lib/components/add-track-modal.svelte'
	import EditTrackModal from '$lib/components/edit-track-modal.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import Icon from '$lib/components/icon.svelte'
	import TestCounter from '$lib/components/test-counter.svelte'
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
		<a href="/" class="home-link" class:active={page.route.id === '/'}>
			{#await preloading}
				{m.app_name()}
			{:then}
				<TestCounter />
			{/await}
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
			{#if userChannel}
				<a href="/{userChannel.slug}" class="btn ChannelLinkButton" {@attach tooltip({content: 'Go to your channel'})}>
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
	.ChannelLinkButton {
		padding: 0;
		max-width: 42px;
		@media (max-width: 768px) {
			max-width: 30px;
		}
	}

	header {
		display: flex;
		flex-flow: column nowrap;
		gap: 1rem;
		padding: 0.5rem;
		background: var(--header-bg);
		border-right: 1px solid light-dark(var(--gray-5), var(--gray-5));
		transition: background 150ms;
		z-index: 50;

		a {
			text-decoration: none;
		}
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	nav:has(.settings-link) {
		flex: 1;
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
