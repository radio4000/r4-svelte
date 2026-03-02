<script>
	import {page} from '$app/state'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'

	let newEmail = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let success = $state(false)
	let loading = $state(false)

	let confirmMessage = $derived(page.url.searchParams.get('message')?.replace(/\+/g, ' '))
	let confirmError = $derived(page.url.searchParams.get('error')?.replace(/\+/g, ' '))

	async function updateEmail(e) {
		e.preventDefault()
		error = null
		success = false

		if (!newEmail) {
			error = m.account_enter_email()
			return
		}

		loading = true
		const {error: err} = await sdk.supabase.auth.updateUser({email: newEmail})
		loading = false

		if (err) {
			error = err.message
		} else {
			success = true
		}
	}
</script>

<svelte:head>
	<title>{m.account_change_email()}</title>
</svelte:head>

<article class="constrained">
	<header>
		<BackLink href="/settings/account" />
		<h1>{m.account_change_email()}</h1>
	</header>

	{#if confirmMessage}
		<p class="success">{confirmMessage}</p>
	{/if}
	{#if confirmError}
		<p class="error">{confirmError}</p>
	{/if}

	{#if !appState.user}
		<p><a href="/auth">{m.account_sign_in_prompt()}</a></p>
	{:else}
		{#if success}
			<p class="success">{m.account_email_confirmation_sent()}</p>
		{:else}
			<form class="form" onsubmit={updateEmail}>
				<fieldset>
					<label for="new-email">{m.account_new_email()}</label>
					<input id="new-email" type="email" bind:value={newEmail} autocomplete="email" required />
				</fieldset>
				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}
				<button type="submit" class="primary" disabled={loading}>
					{loading ? m.common_loading() : m.account_change_email()}
				</button>
			</form>
		{/if}

		<p>{m.account_current_email({email: ''})} <em>{appState.user.email}</em></p>
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
	form {
		margin-block: 1rem;
	}
</style>
