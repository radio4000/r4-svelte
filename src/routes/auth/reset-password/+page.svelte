<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'
	import {resolve} from '$app/paths'
	import {appChatUrl} from '$lib/config'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import * as m from '$lib/paraglide/messages'

	const log = logger.ns('auth').seal()

	let email = $state('')
	let loading = $state(false)
	let error = $state(/** @type {string | null} */ (null))
	let emailSent = $state(false)

	async function handleSubmit(e) {
		e.preventDefault()
		loading = true
		error = null
		try {
			const {error: authError} = await sdk.supabase.auth.signInWithOtp({
				email,
				options: {emailRedirectTo: window.location.origin + resolve('/auth/reset-password/confirm')}
			})
			if (authError) {
				error = authError.message
			} else {
				emailSent = true
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to send reset email'
			log.error('password reset failed:', err)
		} finally {
			loading = false
		}
	}
</script>

<svelte:head>
	<title>{m.auth_reset_page_title()}</title>
</svelte:head>

<article class="constrained focused splash">
	<figure class="logo">
		<IconR4 />
	</figure>

	<h1>{m.auth_reset_heading()}</h1>

	{#if emailSent}
		<section>
			<p><strong>{m.auth_reset_email_sent()}</strong></p>
		</section>
	{:else}
		<p class="subtitle">{m.auth_reset_instruction()}</p>
		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="reset-email">{m.auth_email()}</label>
				<input
					id="reset-email"
					type="email"
					bind:value={email}
					required
					autocomplete="email"
					placeholder={m.auth_email_placeholder()}
				/>
			</fieldset>
			{#if error}
				<p class="error" role="alert">{error}</p>
			{/if}
			<button type="submit" class="primary" disabled={loading}>
				{loading ? m.common_sending() : m.auth_reset_page_title()}
			</button>
		</form>
	{/if}

	<footer>
		<p>
			<a href={resolve('/auth/login')}>{m.auth_card_login_title()}</a>
		</p>
		<p>
			<small>
				{m.auth_reset_help_intro()}
				<a href={appChatUrl} target="_blank">{m.auth_reset_help_link()}</a>
			</small>
		</p>
	</footer>
</article>

<style>
	h1 {
		margin: 0 auto 1rem;
		font-size: var(--font-7);
		text-align: center;
	}

	.subtitle {
		text-align: center;
		color: var(--gray-9);
		margin-bottom: 1rem;
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
