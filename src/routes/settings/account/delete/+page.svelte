<script>
	import {sdk} from '@radio4000/sdk'
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
		window.location.href = '/'
	}
</script>

<svelte:head>
	<title>Delete account</title>
</svelte:head>

<article class="constrained">
	<header>
		<BackLink href="/settings/account" />
		<h1>Delete account</h1>
	</header>

	{#if !appState.user}
		<p>{m.account_sign_in_prompt()}</p>
	{:else}
		<p>This action is permanent and cannot be undone. Deleting your account will:</p>
		<ul>
			<li>Delete all your radio channels</li>
			<li>Delete all your tracks</li>
			<li>Remove your account and all associated data</li>
		</ul>

		{#if deleteError}
			<p class="error" role="alert">{deleteError}</p>
		{/if}

		{#if !confirmDelete}
			<button onclick={() => (confirmDelete = true)} class="danger">Delete my account</button>
		{:else}
			<p><strong>Are you sure? This cannot be undone.</strong></p>
			<menu>
				<button onclick={handleDeleteAccount} disabled={deleting} class="danger">
					{deleting ? m.common_deleting() : 'Yes, delete everything'}
				</button>
				<button onclick={() => (confirmDelete = false)}>{m.common_cancel()}</button>
			</menu>
		{/if}
	{/if}
</article>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}
	h1 {
		margin: 0;
	}
</style>
