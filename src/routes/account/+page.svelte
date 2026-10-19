<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '#lib/app-state.svelte.js'
	import {appName} from '#lib/config.js'
	import BackLink from '#lib/components/back-link.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	let providerLoading = $state(/** @type {string | null} */ (null))
	let providerError = $state(/** @type {string | null} */ (null))

	let sharePresence = $derived(appState.user?.user_metadata?.share_presence !== false)
	let presenceLoading = $state(false)

	async function toggleSharePresence() {
		presenceLoading = true
		await sdk.supabase.auth.updateUser({data: {share_presence: !sharePresence}})
		presenceLoading = false
	}

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
			options: {redirectTo: window.location.origin + '/account'}
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

<Seo title={m.settings_account()} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.settings_account()}</h1>
	</header>

	{#if !appState.user}
		<p><a href={resolve('/auth')}>{m.account_sign_in_prompt()}</a></p>
	{:else}
		{#if providerError}
			<p class="error" role="alert">{providerError}</p>
		{/if}

		<section>
			<menu class="nav-vertical">
				<div>
					<p>
						<span>{m.auth_email()}</span>
						<small>{appState.user.email}</small>
					</p>
					<menu>
						<a class="btn" href={resolve('/account/password')}>{m.account_change_password()}</a>
						<a class="btn" href={resolve('/account/email')}>{m.account_change_email()}</a>
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
							<button
								onclick={() => connectProvider(provider)}
								disabled={providerLoading === provider}
							>
								{providerLoading === provider ? '...' : m.account_connect_provider({provider})}
							</button>
						{/if}
					</div>
				{/each}
			</menu>
		</section>

		<section>
			<menu class="nav-vertical">
				<div>
					<p>
						<span>{m.account_share_presence()}</span>
						<small>{m.account_share_presence_note()}</small>
					</p>
					<button
						onclick={toggleSharePresence}
						disabled={presenceLoading}
						aria-pressed={sharePresence}
					>
						{sharePresence ? m.common_on() : m.common_off()}
					</button>
				</div>
				<div>
					<p><span>{m.auth_log_out()}</span></p>
					<button onclick={() => sdk.auth.signOut()}>{m.auth_log_out()}</button>
				</div>
			</menu>
		</section>

		<section class="danger-zone">
			<menu class="nav-vertical">
				<div>
					<p><span>{m.account_delete_title()}</span></p>
					<a class="btn" href={resolve('/account/delete')}>{m.account_delete_link({appName})}</a>
				</div>
			</menu>
		</section>
	{/if}
</article>

<style>
	section {
		margin: 0 0 1rem;
	}
	section.danger-zone {
		background: color-mix(in oklch, var(--color-error) 8%, var(--color-interface));
		border: 1px solid var(--color-error);
		border-radius: var(--border-radius);
		padding: 0.75rem;

		menu {
			margin-block: 0;
		}
	}
	div {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;

		@media (min-width: 520px) {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
	}
	span {
		text-transform: capitalize;
	}
</style>
