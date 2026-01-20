<script>
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import AddTrackModal from '$lib/components/add-track-modal.svelte'
	import EditTrackModal from '$lib/components/edit-track-modal.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	import HeaderSearch from '$lib/components/header-search.svelte'
	import Icon from '$lib/components/icon.svelte'
	import TestCounter from '$lib/components/test-counter.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import {useLiveQuery} from '$lib/tanstack/useLiveQuery.svelte.js'
	import {broadcastsCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const {preloading} = $props()

	const userChannel = $derived(appState.channel)

	const broadcasts = useLiveQuery(broadcastsCollection)
	const broadcastCount = $derived(broadcasts.data?.length ?? 0)
</script>

<header>
	<a href="/" class:active={page.route.id === '/'}>
		{#await preloading}
			{m.app_name()}
		{:then}
			<TestCounter />
		{/await}
	</a>
	<HeaderSearch />

	<menu class="row right">
		{#await preloading then}
			<AddTrackModal />
			<EditTrackModal />
			{#if userChannel}
				<a href="/{userChannel.slug}" class="btn ChannelLinkButton" {@attach tooltip({content: 'Go to your channel'})}>
					<ChannelAvatar id={userChannel.image} size={32} alt={userChannel.name} />
				</a>
			{/if}
			<!--<hr />-->
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
			<a
				href="/following"
				class="btn"
				class:active={page.route.id === '/following'}
				{@attach tooltip({content: m.nav_following()})}
			>
				<Icon icon="sparkles" size={20} />
			</a>
			<!--
			<a
				href="/stats"
				class="btn"
				class:active={page.route.id === '/stats'}
				{@attach tooltip({content: m.nav_stats()})}
			>
				<Icon icon="chart-scatter" size={20} />
			</a>
			-->
			<!-- <button onclick={toggleChatPanel}>Chat</button> -->
		{/await}
		<!-- <ThemeToggle showLabel={false} /> -->
		<a
			href="/settings"
			class="btn"
			class:active={page.route.id?.startsWith('/settings')}
			{@attach tooltip({content: m.nav_settings()})}
		>
			<Icon icon="settings" size={20} />
		</a>
	</menu>
</header>

<style>
	.ChannelLinkButton {
		padding: 0;
		min-width: 2rem;
	}

	header {
		display: flex;
		flex-flow: row nowrap;
		place-items: center;
		gap: 0.2rem;
		padding: 0.5rem;
		background: var(--header-bg);
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		transition: background 150ms;

		position: sticky;
		top: 0;
		z-index: 50;

		.right {
			margin-left: auto;
			place-content: end;
		}

		a {
			text-decoration: none;
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
</style>
