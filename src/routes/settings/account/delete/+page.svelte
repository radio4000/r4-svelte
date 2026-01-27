<script>
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'

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
	<a href="/settings/account">&larr; Account</a>

	<h1>Delete account</h1>

	{#if !appState.user}
		<p>Please sign in to manage your account.</p>
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
					{deleting ? 'Deleting...' : 'Yes, delete everything'}
				</button>
				<button onclick={() => (confirmDelete = false)}>Cancel</button>
			</menu>
		{/if}
	{/if}
</article>

<style>
	h1 {
		margin-block: 1rem;
	}
</style>
