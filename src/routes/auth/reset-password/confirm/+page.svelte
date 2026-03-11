<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import * as m from '$lib/paraglide/messages'

	let password = $state('')
	let confirmPassword = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)
	let success = $state(false)

	async function handleSubmit(e) {
		e.preventDefault()
		error = null

		if (password !== confirmPassword) {
			error = m.auth_password_mismatch()
			return
		}

		if (password.length < 6) {
			error = m.auth_password_min_length()
			return
		}

		loading = true
		const {error: updateError} = await sdk.supabase.auth.updateUser({password})
		loading = false

		if (updateError) {
			error = updateError.message
		} else {
			success = true
		}
	}
</script>

<svelte:head>
	<title>{m.auth_set_new_password()}</title>
</svelte:head>

<article class="constrained focused splash">
	<header>
		<p><a href={resolve('/auth')}>{m.auth_page_title()}</a> / {m.auth_set_new_password()}</p>
	</header>

	<h1>{m.auth_set_new_password()}</h1>

	{#if success}
		<section>
			<p><strong>{m.auth_password_reset_complete()}</strong></p>
			<menu>
				<a href={resolve('/settings')}><button class="primary">{m.settings_page_title()}</button></a>
			</menu>
		</section>
	{:else}
		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="new-password">{m.auth_new_password()}</label>
				<input
					id="new-password"
					type="password"
					bind:value={password}
					required
					autocomplete="new-password"
					minlength="6"
				/>
			</fieldset>
			<fieldset>
				<label for="confirm-password">{m.auth_confirm_password()}</label>
				<input
					id="confirm-password"
					type="password"
					bind:value={confirmPassword}
					required
					autocomplete="new-password"
					minlength="6"
				/>
			</fieldset>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<button type="submit" class="primary" disabled={loading}>
				{loading ? m.common_loading() : m.account_change_password()}
			</button>
		</form>
	{/if}
</article>

<style>
	h1 {
		margin: 3vh auto;
		font-size: var(--font-7);
		text-align: center;
	}
	section {
		text-align: center;
	}
	menu {
		margin-top: 1rem;
	}
</style>
