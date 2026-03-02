<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'
	import AuthProviders from './auth-providers.svelte'
	// import ButtonFeedback from './button-feedback.svelte'
	import * as m from '$lib/paraglide/messages'
	import {appLegalUrl} from '$lib/config'

	const log = logger.ns('auth').seal()

	let {onSuccess = () => {}, redirect = '/settings', step = $bindable('providers')} = $props()
	const id = $props.id()
	let email = $state('')
	let password = $state('')
	let code = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)
	let showCode = $state(false)

	async function sendMagicLink({rethrow = false} = {}) {
		loading = true
		error = null
		try {
			const {error: authError} = await sdk.supabase.auth.signInWithOtp({
				email,
				options: {
					emailRedirectTo: window.location.origin + redirect
				}
			})
			if (authError) {
				error = authError.message
				if (rethrow) throw authError
			} else {
				step = 'linkSent'
				showCode = false
			}
		} catch (err) {
			if (!error) {
				error = err instanceof Error ? err.message : 'Failed to send magic link'
			}
			log.error('sendMagicLink failed:', err)
			if (rethrow) throw err
		} finally {
			loading = false
		}
	}

	async function signUpWithPassword() {
		loading = true
		error = null
		try {
			const {data, error: authError} = await sdk.auth.signUp({email, password})
			if (authError) {
				error = authError.message
			} else if (data?.session) {
				onSuccess?.(data.user)
			} else if (data?.user) {
				step = 'confirmEmail'
				showCode = false
			} else {
				error = 'Sign up failed — please try again'
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign up failed'
			log.error('signUpWithPassword failed:', err)
		} finally {
			loading = false
		}
	}

	async function verifyOtp(/** @type {import('@supabase/supabase-js').EmailOtpType} */ type = 'email') {
		loading = true
		error = null
		try {
			const {data, error: authError} = await sdk.supabase.auth.verifyOtp({email, token: code, type})
			if (authError) {
				error = authError.message
			} else if (data?.session) {
				onSuccess?.(data.user)
			} else {
				error = 'Verification failed — please try again'
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Verification failed'
			log.error('verifyOtp failed:', err)
		} finally {
			loading = false
		}
	}

	function handleEmailContinue() {
		step = 'email'
	}
</script>

{#if step === 'confirmEmail'}
	<section>
		<h2>{m.auth_check_email()}</h2>
		<p>{m.auth_click_link()}</p>
		<p><small>{email}</small></p>
	</section>
	{#if showCode}
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
					disabled={loading}
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
	{:else}
		<menu class="centerwrap">
			<button type="button" onclick={() => (showCode = true)}>{m.auth_enter_code_manually()}</button>
		</menu>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
{:else if step === 'linkSent'}
	<section>
		<h2>{m.auth_check_email()}</h2>
		<p>{m.auth_magic_link_sent({email})}</p>
	</section>
	{#if showCode}
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
					disabled={loading}
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
	{/if}
	<menu class="centerwrap">
		{#if !showCode}
			<button type="button" onclick={() => (showCode = true)}>{m.auth_enter_code_manually()}</button>
		{/if}
		<!-- <ButtonFeedback onclick={() => sendMagicLink({rethrow: true})} success={m.auth_resend_success()}>
			{m.auth_resend()}
		</ButtonFeedback> -->
		<!-- <button type="button" onclick={() => (step = 'password')}>{m.auth_use_password_instead()}</button> -->
	</menu>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p><button type="button" class="link" onclick={() => (step = 'email')}>← {m.common_back()}</button></p>
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
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p><button type="button" class="link" onclick={() => (step = 'email')}>← {m.auth_use_magic_link()}</button></p>
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
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<!-- <menu class="centerwrap">
		<button type="button" onclick={() => (step = 'password')}>{m.auth_use_password_instead()}</button>
	</menu> -->
	<p><button type="button" class="link" onclick={() => (step = 'providers')}>← {m.common_back()}</button></p>
{:else}
	<AuthProviders onEmailClick={handleEmailContinue} {redirect} />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p>
		<small
			>{m.auth_terms_prefix()}
			<a href="{appLegalUrl}/terms-of-service" target="_blank" rel="noopener">{m.auth_terms_link()}</a>.</small
		>
	</p>
{/if}

<style>
	menu {
		gap: 0.5rem;
		margin-top: 1rem;
	}
	form {
		margin-block: 1rem;
	}
	section {
		text-align: center;
	}
	p:has(small) {
		margin-top: 1rem;
		text-align: center;
		color: var(--gray-9);
	}
	p:has(button.link) {
		margin-top: 1rem;
		text-align: center;
	}
</style>
