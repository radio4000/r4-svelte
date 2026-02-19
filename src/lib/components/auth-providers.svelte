<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'
	import * as m from '$lib/paraglide/messages'

	const log = logger.ns('auth').seal()

	let {onEmailClick, redirect = '/settings'} = $props()

	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)

	async function signInWithProvider(provider) {
		loading = true
		error = null
		try {
			const {error: authError} = await sdk.supabase.auth.signInWithOAuth({
				provider,
				options: {
					redirectTo: window.location.origin + redirect
				}
			})
			if (authError) {
				error = authError.message
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Sign in failed'
			log.error('signInWithProvider failed:', err)
		} finally {
			loading = false
		}
	}
</script>

<menu>
	<button type="button" onclick={onEmailClick}>{m.auth_continue_with_email()}</button>
	<button type="button" onclick={() => signInWithProvider('google')} disabled={loading}
		>{m.auth_continue_with_google()}</button
	>
	<button type="button" onclick={() => signInWithProvider('facebook')} disabled={loading}
		>{m.auth_continue_with_facebook()}</button
	>
</menu>

{#if error}
	<p class="error" role="alert">{error}</p>
{/if}

<style>
	menu {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
</style>
