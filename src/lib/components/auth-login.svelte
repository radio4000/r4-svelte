<script>
	import {sdk} from '@radio4000/sdk'
	import AuthProviders from './auth-providers.svelte'
	import * as m from '$lib/paraglide/messages'

	let {onSuccess, redirect = '/settings'} = $props()

	let step = $state('providers') // 'providers' | 'email' | 'password' | 'linkSent'
	let email = $state('')
	let password = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)

	async function sendMagicLink() {
		loading = true
		error = null
		const {error: authError} = await sdk.supabase.auth.signInWithOtp({
			email,
			options: {
				emailRedirectTo: window.location.origin + redirect
			}
		})
		loading = false
		if (authError) {
			error = authError.message
		} else {
			step = 'linkSent'
		}
	}

	async function signInWithPassword() {
		loading = true
		error = null
		const {data, error: authError} = await sdk.auth.signIn({email, password})
		loading = false
		if (authError) {
			error = authError.message
		} else if (data?.user) {
			onSuccess?.(data.user)
		}
	}

	function handleEmailContinue() {
		step = 'email'
	}
</script>

{#if step === 'linkSent'}
	<section>
		<h2>{m.auth_check_email()}</h2>
		<p>{m.auth_magic_link_sent({email})}</p>
		<menu>
			<button type="button" onclick={() => sendMagicLink()} disabled={loading}>
				{loading ? m.common_sending() : m.auth_resend()}
			</button>
			<button type="button" onclick={() => (step = 'email')}>{m.auth_use_different_email()}</button>
			<button type="button" onclick={() => (step = 'password')}>{m.auth_have_password()}</button>
		</menu>
	</section>
{:else if step === 'password'}
	<form
		onsubmit={(e) => {
			e.preventDefault()
			signInWithPassword()
		}}
	>
		<label>
			{m.auth_email()}
			<input type="email" bind:value={email} required autocomplete="email" placeholder="Enter your email address…" />
		</label>
		<label>
			{m.auth_password()}
			<input
				type="password"
				bind:value={password}
				required
				autocomplete="current-password"
				placeholder="Enter your password…"
			/>
		</label>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		<button type="submit" class="primary" disabled={loading}>
			{loading ? m.auth_logging_in() : m.auth_log_in()}
		</button>
	</form>
	<menu>
		<button type="button" onclick={() => (step = 'email')}>← {m.auth_use_magic_link()}</button>
		<a href="/auth/reset-password">{m.auth_forgot_password()}</a>
	</menu>
{:else if step === 'email'}
	<form
		onsubmit={(e) => {
			e.preventDefault()
			sendMagicLink()
		}}
	>
		<label>
			{m.auth_email()}
			<input type="email" bind:value={email} required autocomplete="email" placeholder="Enter your email address…" />
		</label>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		<button type="submit" class="primary" disabled={loading}>
			{loading ? m.common_sending() : m.auth_continue_with_email()}
		</button>
	</form>
	<menu>
		<button type="button" onclick={() => (step = 'password')}>{m.auth_have_password()}</button>
		<button type="button" onclick={() => (step = 'providers')}>← {m.common_back()}</button>
	</menu>
{:else}
	<AuthProviders onEmailClick={handleEmailContinue} {redirect} />
{/if}

<style>
	form,
	label {
		display: flex;
		flex-direction: column;
	}
	form {
		gap: 0.5rem;
	}
	label {
		gap: 0.2rem;
	}
	menu {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	section {
		text-align: center;
	}
	h2 {
		font-size: var(--font-7);
	}
</style>
