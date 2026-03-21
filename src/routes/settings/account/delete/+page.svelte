<script>
	import {sdk} from '@radio4000/sdk'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'

	let confirmDelete = $state(false)
	let deleting = $state(false)
	let deleteError = $state(/** @type {string | null} */ (null))

	async function handleDeleteAccount() {
		deleting = true
		deleteError = null
		const {error} = await sdk.supabase.rpc('delete_user')
		deleting = false
		if (error) {
			deleteError = error.message
			return
		}
		await sdk.auth.signOut()
		goto(resolve('/'))
	}
</script>

<svelte:head>
	<title>{m.account_delete_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings/account')} />
		<h1>{m.account_delete_title()}</h1>
	</header>

	{#if !appState.user}
		<p>{m.account_sign_in_prompt()}</p>
	{:else}
		<p>
			{m.account_delete_warning_pre()} <strong>{appState.user.email}</strong>
			{m.account_delete_warning_post()}
		</p>
		<p><strong>{m.account_delete_irreversible()}</strong></p>
		<ul>
			<li>{m.account_delete_item_channels()}</li>
			<li>{m.account_delete_item_tracks()}</li>
			<li>{m.account_delete_item_data()}</li>
		</ul>

		{#if deleteError}
			<p class="error" role="alert">{deleteError}</p>
		{/if}

		{#if !confirmDelete}
			<p class="actions">
				<button onclick={() => (confirmDelete = true)} class="danger stack">
					<span>{m.account_delete_title()}</span>
					<small>{appState.user.email}</small>
				</button>
			</p>
		{:else}
			<p><strong>{m.account_delete_confirm()}</strong></p>
			<p class="actions">
				<button onclick={handleDeleteAccount} disabled={deleting} class="danger stack">
					<span>{deleting ? m.common_deleting() : m.account_delete_irreversible()}</span>
					<small>{appState.user.email}</small>
				</button>
				<button onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button>
			</p>
		{/if}
	{/if}
</article>

<style>
	ul {
		margin-block: 1rem;
	}
	.actions {
		margin-block-start: 1.5rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.stack {
		flex-wrap: wrap;
		padding-block: 0.4rem;
		gap: 0.25rem;

		small {
			flex: 1 0 100%;
			color: inherit;
			font-weight: 700;
		}
	}
</style>
