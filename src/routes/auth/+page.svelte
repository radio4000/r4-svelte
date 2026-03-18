<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {inArray} from '@tanstack/db'
	import {channelsCollection} from '$lib/collections/channels'
	import {appName} from '$lib/config'
	import * as m from '$lib/paraglide/messages'

	const redirect = page.url.searchParams.get('redirect')
	const redirectParam = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''

	const userChannelsQuery = useLiveQuery((q) =>
		q.from({channels: channelsCollection}).where(({channels}) => inArray(channels.id, appState.channels || []))
	)

	const log = logger.ns('auth').seal()
	let signOutError = $state(/** @type {string | null} */ (null))

	async function handleSignOut() {
		signOutError = null
		try {
			const {error} = await sdk.auth.signOut()
			if (error) {
				signOutError = error.message
				log.error('signOut failed:', error)
			}
		} catch (err) {
			signOutError = err instanceof Error ? err.message : 'Sign out failed'
			log.error('signOut failed:', err)
		}
	}
</script>

<svelte:head>
	<title>{m.auth_page_title()}</title>
</svelte:head>

<article class="constrained focused splash">
	<figure class="logo">
		<IconR4 />
	</figure>

	{#if appState.user}
		<p style="margin-block: 2rem">{m.auth_signed_in_as({email: appState.user.email})}</p>

		{#if userChannelsQuery.isLoading}
			<p>{m.auth_loading_channels()}</p>
		{:else if userChannelsQuery.isError}
			<p>
				{m.auth_error_loading_channels({
					message:
						channelsCollection.utils.lastError instanceof Error
							? channelsCollection.utils.lastError.message
							: 'Sync failed'
				})}
			</p>
		{:else if userChannelsQuery.data?.length}
			<section class="channels-grid">
				{#each userChannelsQuery.data as channel (channel.id)}
					<ChannelCard {channel} />
				{/each}
			</section>
		{/if}

		<menu class="nav-vertical">
			{#if !userChannelsQuery.data?.length}
				<a href={resolve('/create-channel')}>{m.auth_create_radio_cta()}</a>
			{/if}
			<a href={resolve('/settings')}>{m.settings_title()}</a>
			<button type="button" onclick={handleSignOut}>{m.auth_log_out()}</button>
		</menu>

		{#if signOutError}
			<p class="error" role="alert">{signOutError}</p>
		{/if}
	{:else}
		<menu class="nav-options">
			<a href={resolve('/auth/create-account') + redirectParam}>
				<h3>{m.auth_card_create_title()}</h3>
				<p>{m.auth_card_create_description({appName})}</p>
			</a>
			<a href={resolve('/auth/login') + redirectParam}>
				<h3>{m.auth_card_login_title()}</h3>
				<p>{m.auth_card_login_description()}</p>
			</a>
		</menu>
		<a href={resolve('/')} class="welcome-link">{appName}?</a>
	{/if}
</article>

<style>
	.welcome-link {
		text-align: center;
		margin-top: 2rem;
	}

	.channels-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-block: 1.5rem;
	}
</style>
