<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'
	import AuthProviders from './auth-providers.svelte'
	// import ButtonFeedback from './button-feedback.svelte'
	import * as m from '$lib/paraglide/messages'

	const log = logger.ns('auth').seal()

	let {onSuccess, redirect = '/settings', step = $bindable('providers')} = $props()
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

	async function signInWithPassword() {
		loading = true
		error = null
		try {
			const {data, error: authError} = await sdk.auth.signIn({email, password})
			if (authError) {
				error = authError.message
			} else if (data?.user) {
				onSuccess?.(data.user)
			} else {
				error = 'Sign in failed — please try again'
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign in failed'
			log.error('signInWithPassword failed:', err)
		} finally {
			loading = false
		}
	}

	async function verifyOtp() {
		loading = true
		error = null
		try {
			const {data, error: authError} = await sdk.supabase.auth.verifyOtp({
				email,
				token: code,
				type: 'email'
			})
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

	function handleSubmitEmail() {
		if (password) {
			signInWithPassword()
		} else {
			sendMagicLink()
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
	{#if showCode}
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
			<button type="button" onclick={() => (showCode = true)}>{m.auth_enter_code_manually()}</button
			>
		{/if}
		<!-- <ButtonFeedback onclick={() => sendMagicLink({rethrow: true})} success={m.auth_resend_success()}>
			{m.auth_resend()}
		</ButtonFeedback> -->
	</menu>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p>
		<button type="button" class="link" onclick={() => (step = 'email')}>← {m.common_back()}</button>
	</p>
{:else if step === 'email'}
	<form
		class="form"
		onsubmit={(e) => {
			e.preventDefault()
			handleSubmitEmail()
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
				placeholder={m.auth_email_placeholder()}
			/>
		</fieldset>
		<fieldset>
			<label for="{id}-password">{m.auth_password()}</label>
			<input
				id="{id}-password"
				type="password"
				bind:value={password}
				autocomplete="current-password"
				placeholder={m.auth_password_optional_placeholder()}
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={loading}>
			{loading ? m.common_sending() : m.auth_continue_with_email()}
		</button>
	</form>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<p>
		<button type="button" class="link" onclick={() => (step = 'providers')}
			>← {m.common_back()}</button
		>
	</p>
{:else}
	<AuthProviders onEmailClick={handleEmailContinue} {redirect} />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
{/if}

<style>
	section {
		text-align: center;
	}
	h2 {
		font-size: var(--font-7);
	}
	p:has(button.link) {
		text-align: center;
		margin-top: 1rem;
	}
	menu.centerwrap {
		flex-wrap: wrap;
		justify-content: center;
	}
</style>
