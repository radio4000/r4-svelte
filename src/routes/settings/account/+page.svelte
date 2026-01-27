<script>
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let providerLoading = $state(/** @type {string | null} */ (null))
	let providerError = $state(/** @type {string | null} */ (null))

	let identities = $state([])
	const canDisconnect = $derived(identities.length > 1)

	$effect(() => {
		if (appState.user) loadIdentities()
	})

	async function loadIdentities() {
		const {data} = await sdk.supabase.auth.getUserIdentities()
		identities = data?.identities ?? []
	}

	async function connectProvider(provider) {
		providerError = null
		providerLoading = provider
		const {error} = await sdk.supabase.auth.linkIdentity({
			provider,
			options: {redirectTo: window.location.origin + '/settings/account'}
		})
		providerLoading = null
		if (error) {
			providerError = error.message
		}
	}

	async function disconnectProvider(identity) {
		if (!canDisconnect) return
		providerError = null
		providerLoading = identity.provider
		const {error} = await sdk.supabase.auth.unlinkIdentity(identity)
		providerLoading = null
		if (error) {
			providerError = error.message
		} else {
			await loadIdentities()
		}
	}

	const providers = ['google', 'facebook']

	function getIdentity(provider) {
		return identities.find((i) => i.provider === provider)
	}
</script>

<svelte:head>
	<title>{m.settings_account()}</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; {m.settings_page_title()}</a>

	<h1>{m.settings_account()}</h1>

	{#if !appState.user}
		<p><a href="/auth">{m.account_sign_in_prompt()}</a></p>
	{:else}
		{#if providerError}
			<p class="error" role="alert">{providerError}</p>
		{/if}

		<menu data-vertical>
			<div>
				<p>
					<span>Email</span>
					<small>{appState.user.email}</small>
				</p>
				<menu>
					<a class="btn" href="/settings/account/password">{m.account_change_password()}</a>
					<a class="btn" href="/settings/account/email">Change email</a>
				</menu>
			</div>
			{#each providers as provider (provider)}
				{@const identity = getIdentity(provider)}
				<div>
					<p>
						<span>{provider}</span>
						{#if identity?.identity_data?.email}
							<small>{identity.identity_data.email}</small>
						{/if}
					</p>
					{#if identity}
						<button
							onclick={() => disconnectProvider(identity)}
							disabled={!canDisconnect || providerLoading === provider}
							title={canDisconnect ? '' : m.account_need_two_providers()}
						>
							{providerLoading === provider ? '...' : m.account_disconnect_provider()}
						</button>
					{:else}
						<button onclick={() => connectProvider(provider)} disabled={providerLoading === provider}>
							{providerLoading === provider ? '...' : 'Connect'}
						</button>
					{/if}
				</div>
			{/each}
		</menu>

		<p><button onclick={() => sdk.auth.signOut()}>{m.auth_log_out()}</button></p>
		<br />
		<p><a href="/settings/account/delete">I want to delete my account</a></p>
	{/if}
</article>

<style>
	h1 {
		margin-block-start: 1rem;
	}

	article > menu {
		margin-block: 1rem;
		div {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 0.5rem;
		}
		span {
			text-transform: capitalize;
		}
	}
</style>
