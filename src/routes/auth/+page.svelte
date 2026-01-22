<script>
	import {sdk} from '@radio4000/sdk'
	import {page} from '$app/state'
	import {appState} from '$lib/app-state.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import IconR4 from '$lib/icon-r4.svelte'
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {inArray} from '@tanstack/db'
	import {channelsCollection} from '$lib/tanstack/collections'
	import * as m from '$lib/paraglide/messages'

	const redirect = page.url.searchParams.get('redirect')
	const redirectParam = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''

	const userChannelsQuery = useLiveQuery((q) =>
		q.from({channels: channelsCollection}).where(({channels}) => inArray(channels.id, appState.channels || []))
	)
</script>

<svelte:head>
	<title>{m.auth_page_title()}</title>
</svelte:head>

<article class="constrained focused">
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

		<menu data-vertical>
			{#if !userChannelsQuery.data?.length}
				<a href="/create-channel">{m.auth_create_radio_cta()}</a>
			{/if}
			<a href="/settings">Settings</a>
			<button type="button" onclick={() => sdk.auth.signOut()}>{m.auth_log_out()}</button>
		</menu>
	{:else}
		<menu class="options">
			<a href="/auth/create-account{redirectParam}">
				<h3>{m.auth_card_create_title()}</h3>
				<p>{m.auth_card_create_description()}</p>
			</a>
			<a href="/auth/login{redirectParam}">
				<h3>{m.auth_card_login_title()}</h3>
				<p>{m.auth_card_login_description()}</p>
			</a>
		</menu>
	{/if}
</article>

<style>
	.channels-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
		margin-block: 1.5rem;
	}

	.options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 2rem;
		text-align: center;
		font-size: var(--font-6);

		> a {
			text-decoration: none;
			padding: 2rem 1rem;
			border: 1px solid var(--gray-6);
			border-radius: var(--border-radius);

			&:hover {
				background: var(--accent-3);
				color: light-dark(var(--gray-12), var(--gray-12));
				border-color: light-dark(var(--accent-1), var(--accent-12));
			}
		}

		h3 {
			text-decoration: underline;
			font-size: var(--font-7);
			font-weight: 600;
		}
	}
</style>
