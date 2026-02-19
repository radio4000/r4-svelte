<script>
	import {sdk} from '@radio4000/sdk'
	import AuthProviders from './auth-providers.svelte'
	import * as m from '$lib/paraglide/messages'

	let {onSuccess, redirect = '/settings'} = $props()
	const id = $props.id()

	let step = $state('providers') // 'providers' | 'email' | 'password' | 'linkSent'
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

	async function verifyOtp() {
		loading = true
		error = null
		const {data, error: authError} = await sdk.supabase.auth.verifyOtp({email, token: code, type: 'email'})
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

{#if step === 'linkSent'}
	<section>
		<h2>{m.auth_check_email()}</h2>
		<p>{m.auth_magic_link_sent({email})}</p>
	</section>
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			verifyOtp()
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
		<button type="button" onclick={() => (step = 'password')}>{m.auth_have_password()}</button>
	</menu>
{:else if step === 'password'}
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			signInWithPassword()
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
				autocomplete="current-password"
				placeholder="Enter your password…"
			/>
		</fieldset>
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
		<button type="button" onclick={() => (step = 'password')}>{m.auth_have_password()}</button>
		<button type="button" onclick={() => (step = 'providers')}>← {m.common_back()}</button>
	</menu>
{:else}
	<AuthProviders onEmailClick={handleEmailContinue} {redirect} />
{/if}

{#if error}
	<p class="error" role="alert">{error}</p>
{/if}

<style>
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
