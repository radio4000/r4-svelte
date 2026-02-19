<script>
	import {sdk} from '@radio4000/sdk'
	import AuthProviders from './auth-providers.svelte'
	import * as m from '$lib/paraglide/messages'

	let {onSuccess = () => {}, redirect = '/settings'} = $props()
	const id = $props.id()

	let step = $state('providers') // 'providers' | 'email' | 'password' | 'linkSent' | 'confirmEmail'
	let email = $state('')
	let password = $state('')
	let code = $state('')
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

	async function signUpWithPassword() {
		loading = true
		error = null
		const {data, error: authError} = await sdk.auth.signUp({email, password})
		loading = false
		if (authError) {
			error = authError.message
		} else if (data?.session) {
			onSuccess?.(data.user)
		} else if (data?.user) {
			step = 'confirmEmail'
		}
	}

	async function verifyOtp(/** @type {import('@supabase/supabase-js').EmailOtpType} */ type = 'email') {
		loading = true
		error = null
		const {data, error: authError} = await sdk.supabase.auth.verifyOtp({email, token: code, type})
		loading = false
		if (authError) {
			error = authError.message
		} else if (data?.session) {
			onSuccess?.(data.user)
		}
	}

	function handleEmailContinue() {
		step = 'email'
	}
</script>

{#if step === 'confirmEmail'}
	<section>
		<h3>{m.auth_check_email()}</h3>
		<p>{m.auth_click_link()}</p>
		<p><small>{email}</small></p>
	</section>
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			verifyOtp('signup')
		}}
	>
		<fieldset>
			<label for="{id}-code">{m.auth_code_or_enter()}</label>
			<input
				id="{id}-code"
				type="text"
				inputmode="numeric"
				bind:value={code}
				required
				minlength="6"
				maxlength="6"
				placeholder="123456"
				autocomplete="one-time-code"
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={loading || code.length < 6}>
			{loading ? '…' : m.auth_code_verify()}
		</button>
	</form>
{:else if step === 'linkSent'}
	<section>
		<h3>{m.auth_check_email()}</h3>
		<p>{m.auth_magic_link_sent({email})}</p>
	</section>
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			verifyOtp('email')
		}}
	>
		<fieldset>
			<label for="{id}-code">{m.auth_code_or_enter()}</label>
			<input
				id="{id}-code"
				type="text"
				inputmode="numeric"
				bind:value={code}
				required
				minlength="6"
				maxlength="6"
				placeholder="123456"
				autocomplete="one-time-code"
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={loading || code.length < 6}>
			{loading ? '…' : m.auth_code_verify()}
		</button>
	</form>
	<menu>
		<button type="button" onclick={() => sendMagicLink()} disabled={loading}>
			{loading ? m.common_sending() : m.auth_resend()}
		</button>
		<button type="button" onclick={() => (step = 'email')}>{m.auth_use_different_email()}</button>
		<button type="button" onclick={() => (step = 'password')}>{m.auth_use_password_instead()}</button>
	</menu>
{:else if step === 'password'}
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			signUpWithPassword()
		}}
	>
		<fieldset>
			<label for="{id}-email">{m.auth_email()}</label>
			<input
				id="{id}-email"
				type="email"
				bind:value={email}
				required
				autocomplete="email"
				placeholder="Enter your email address…"
			/>
		</fieldset>
		<fieldset>
			<label for="{id}-password">{m.auth_password()}</label>
			<input
				id="{id}-password"
				type="password"
				bind:value={password}
				required
				autocomplete="new-password"
				minlength="6"
				placeholder="Choose a password…"
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={loading}>
			{loading ? m.auth_creating_account() : m.auth_create_account()}
		</button>
	</form>
	<menu>
		<button type="button" onclick={() => (step = 'email')}>← {m.auth_use_magic_link()}</button>
	</menu>
{:else if step === 'email'}
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			sendMagicLink()
		}}
	>
		<fieldset>
			<label for="{id}-email">{m.auth_email()}</label>
			<input
				id="{id}-email"
				type="email"
				bind:value={email}
				required
				autocomplete="email"
				placeholder="Enter your email address…"
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={loading}>
			{loading ? m.common_sending() : m.auth_continue_with_email()}
		</button>
	</form>
	<menu>
		<button type="button" onclick={() => (step = 'password')}>{m.auth_use_password_instead()}</button>
		<button type="button" onclick={() => (step = 'providers')}>← {m.common_back()}</button>
	</menu>
{:else}
	<AuthProviders onEmailClick={handleEmailContinue} {redirect} />
	<p>
		<small
			>{m.auth_terms_prefix()}
			<a href="https://legal.radio4000.com/terms-of-service" target="_blank" rel="noopener">{m.auth_terms_link()}</a
			>.</small
		>
	</p>
{/if}

{#if error}
	<p class="error" role="alert">{error}</p>
{/if}

<style>
	menu {
		gap: 0.5rem;
		margin-top: 1rem;
	}
	section {
		text-align: center;
	}
	p:has(small) {
		margin-top: 1rem;
		text-align: center;
		color: var(--gray-9);
	}
</style>
