<script>
	import {sdk} from '@radio4000/sdk'
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'

	let newPassword = $state('')
	let confirmPassword = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let success = $state(false)
	let loading = $state(false)

	async function updatePassword(e) {
		e.preventDefault()
		error = null
		success = false

		if (newPassword !== confirmPassword) {
			error = m.auth_password_mismatch()
			return
		}

		if (newPassword.length < 6) {
			error = m.auth_password_min_length()
			return
		}

		loading = true
		const {error: err} = await sdk.supabase.auth.updateUser({password: newPassword})
		loading = false

		if (err) {
			error = err.message
		} else {
			success = true
			newPassword = ''
			confirmPassword = ''
		}
	}
</script>

<svelte:head>
	<title>{m.account_change_password()}</title>
</svelte:head>

<article class="constrained">
	<a href="/settings/account">&larr; {m.settings_account()}</a>

	<h1>{m.account_change_password()}</h1>

	{#if !appState.user}
		<p>{m.account_sign_in_prompt()}</p>
	{:else}
		<form class="form" onsubmit={updatePassword}>
			<fieldset>
				<label for="new-password">{m.auth_new_password()}</label>
				<input
					id="new-password"
					type="password"
					bind:value={newPassword}
					autocomplete="new-password"
					required
					minlength="6"
				/>
			</fieldset>
			<fieldset>
				<label for="confirm-password">{m.auth_confirm_password()}</label>
				<input
					id="confirm-password"
					type="password"
					bind:value={confirmPassword}
					autocomplete="new-password"
					required
					minlength="6"
				/>
			</fieldset>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			{#if success}
				<p class="success">{m.account_password_updated()}</p>
			{/if}
			<button type="submit" class="primary" disabled={loading}>
				{loading ? m.loading() : m.common_save()}
			</button>
		</form>
		<menu>
			<a href="/settings/account">← {m.common_back()}</a>
		</menu>
	{/if}
</article>

<style>
	h1 {
		margin-block: 1rem;
	}
</style>
