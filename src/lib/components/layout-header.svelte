<script>
	import {page} from '$app/state'
	import {useAppState} from '$lib/app-state.svelte'
	import {watchBroadcasts} from '$lib/broadcast'
	import AddTrackModal from '$lib/components/add-track-modal.svelte'
	import EditTrackModal from '$lib/components/edit-track-modal.svelte'
	import ChannelAvatar from '$lib/components/channel-avatar.svelte'
	// import HeaderSearch from '$lib/components/header-search.svelte'
	import Icon from '$lib/components/icon.svelte'
	import TestCounter from '$lib/components/test-counter.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.js'
	import ThemeToggle from '$lib/components/theme-toggle.svelte'
	import {r5} from '$lib/r5'

	const {preloading} = $props()

	const appState = $derived(useAppState().data)

	const userChannel = $derived.by(async () => {
		const id = appState?.channels?.[0]
		if (!id) return null
		const channels = await r5.channels.pull({id, limit: 1})
		return channels[0] || null
	})

	let broadcastCount = $state(0)
	let editModalRef = $state()

	const unsubscribe = watchBroadcasts((data) => {
		broadcastCount = data.broadcasts.length
	})

	function handleEditTrackEvent(event) {
		editModalRef?.openWithTrack(event.detail.track)
	}

	$effect(() => unsubscribe)
</script>

<svelte:window on:r5:openEditModal={handleEditTrackEvent} />

<header>
	<a href="/" class:active={page.route.id === '/'}>
		{#await preloading}
			R0
		{:then}
			<TestCounter />
		{/await}
	</a>
	<!-- <HeaderSearch /> -->

	<menu class="row right">
		{#await preloading then}
			<AddTrackModal />
			<EditTrackModal bind:this={editModalRef} />
			{#await userChannel then channel}
				{#if channel}
					<a href="/{channel.slug}">
						<ChannelAvatar id={channel.image} size={32} alt={channel.name} />
					</a>
				{/if}
			{/await}
			<hr />
			<a
				href="/broadcasts"
				class="btn"
				class:active={page.route.id === '/broadcasts'}
				{@attach tooltip({content: 'Broadcasts'})}
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
				{@attach tooltip({content: 'Following'})}
			>
				<Icon icon="favorite" size={20} />
			</a>
			<a href="/stats" class="btn" class:active={page.route.id === '/stats'} {@attach tooltip({content: 'Stats'})}>
				<Icon icon="chart-scatter" size={20} />
			</a>
			<!-- <button onclick={toggleChatPanel}>Chat</button> -->
			<a href="/cli" class="btn" class:active={page.route.id === '/cli'} {@attach tooltip({content: 'CLI'})}>
				<Icon icon="terminal" size={20} />
			</a>
		{/await}
		<ThemeToggle showLabel={false} />
		<a
			href="/settings"
			class="btn"
			class:active={page.route.id === '/settings'}
			{@attach tooltip({content: 'Settings'})}
		>
			<Icon icon="settings" size={20} />
		</a>
	</menu>
</header>

<style>
	header {
		display: flex;
		flex-flow: row wrap;
		place-items: center;
		gap: 0.2rem;
		padding: 0.5rem;
		background: var(--header-bg);
		border-bottom: 1px solid light-dark(var(--gray-5), var(--gray-5));
		transition: background 150ms;

		.right {
			margin-left: auto;
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
