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
	import {broadcastsCollection, pinsCollection, viewsCollection} from '$lib/tanstack/collections'
	import {useLiveQuery as useLiveQueryCustom} from '$lib/tanstack/useLiveQuery.svelte'
	import {parseView} from '$lib/views.svelte'
	import * as m from '$lib/paraglide/messages'

	const {preloading} = $props()

	const userChannel = $derived(appState.channel)

	const broadcasts = useLiveQuery(broadcastsCollection)
	const broadcastCount = $derived(broadcasts.data?.length ?? 0)

	const pinsQuery = useLiveQueryCustom(pinsCollection)
	const viewsQuery = useLiveQueryCustom(viewsCollection)
	const pins = $derived((pinsQuery.data ?? []).toSorted((a, b) => a.position - b.position))
	const pinnedViews = $derived(
		pins
			.map((pin) => {
				const sv = (viewsQuery.data ?? []).find((v) => v.id === pin.view_id)
				if (!sv) return null
				const view = parseView(new URLSearchParams(sv.params))
				const channels = view.channels || []
				const isSingleChannel = channels.length === 1 && !view.tags?.length && !view.search
				const href = isSingleChannel ? resolve(`/${channels[0]}`) : resolve(`/search?${sv.params}`)
				return {pin, sv, href}
			})
			.filter((x) => x !== null)
	)
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
			<Icon icon="signal" />
			{#if broadcastCount > 0}
				<span class="count">{broadcastCount}</span>
			{/if}
		</a>
		{#each pinnedViews as pv (pv.pin.id)}
			<a href={pv.href} class="btn pin-link" aria-label={pv.sv.name}>
				{pv.sv.name}
			</a>
		{/each}
		{#if appState.user && !pinnedViews.length}
			<a
				href={resolve('/settings/pins')}
				class="btn pin-link"
				{@attach tooltip({content: 'Pin views to sidebar'})}
				aria-label="Pin views"
			>
				<Icon icon="add" size={16} />
			</a>
		{/if}
	</nav>

	<nav>
		{#await preloading then}
			<AddTrackDialog />
			<EditTrackDialog />
			<ShareDialog />
			<ShortcutsDialog />
			{#if userChannel}
				<a
					href={resolve(`/${userChannel.slug}`)}
					class="btn channel-link"
					{@attach tooltip({content: 'Go to your channel'})}
				>
					<ChannelAvatar id={userChannel.image} alt={userChannel.name} />
				</a>
			{/if}
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

	.nav-secondary {
		flex: 1;
		justify-content: flex-start;
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
			min-width: var(--track-artwork-size);
			height: 32px;
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

	.pin-link {
		white-space: normal;
		word-break: break-all;
		font-size: var(--font-1);
		padding: 0;
		max-width: 2.625rem;
	}

	@media (min-width: 768px) {
		/* Square buttons when vertical */
		nav :global(.btn) {
			aspect-ratio: 1/1;
		}
	}
</style>
