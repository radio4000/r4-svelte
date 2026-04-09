<script>
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import IconR4 from '$lib/components/icon-r4.svelte'
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
	<figure class="logo">
		<IconR4 />
	</figure>

	<h1>{m.auth_set_new_password()}</h1>

	{#if success}
		<section>
			<p><strong>{m.auth_password_reset_complete()}</strong></p>
		</section>
		<footer>
			<p><a href={resolve('/auth/login')} class="btn primary">{m.auth_card_login_title()}</a></p>
		</footer>
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
		<footer>
			<p><a href={resolve('/auth/login')}>{m.auth_card_login_title()}</a></p>
		</footer>
	{/if}
</article>

<style>
	h1 {
		margin: 0 auto 1rem;
		font-size: var(--font-7);
		text-align: center;
	}

	section {
		text-align: center;
	}

	footer {
		margin-top: 3rem;
		text-align: center;
		color: var(--gray-9);
	}
</style>
