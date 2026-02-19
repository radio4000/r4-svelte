<script>
	import {sdk} from '@radio4000/sdk'
	import {logger} from '$lib/logger'

	const log = logger.ns('auth').seal()

	let {onsubmit} = $props()
	let email = $state('')
	let loading = $state(false)
	let errorMessage = $state('')

	async function handleSubmit(event) {
		event.preventDefault()
		loading = true
		errorMessage = ''

		let error = null
		let data = null

		try {
			const res = await sdk.supabase.auth.signInWithOtp({
				email,
				options: {
					emailRedirectTo: window.location.href
				}
			})
			if (res.error) {
				throw res.error
			}
			data = res.data
		} catch (err) {
			error = err
			errorMessage = err.message || 'Failed to send reset email'
			log.error('password reset failed:', err)
		} finally {
			loading = false
		}

		onsubmit?.({detail: {error, data}})
	}
</script>

<form onsubmit={handleSubmit}>
	<fieldset>
		<legend>Email</legend>
		<input
			type="email"
			name="email"
			autocomplete="username"
			required
			placeholder="email@example.org"
			bind:value={email}
		/>
	</fieldset>

	{#if errorMessage}
		<p class="error">{errorMessage}</p>
	{/if}

	<fieldset>
		<button type="submit" disabled={loading}>
			{loading ? 'Sending...' : 'Send reset password link'}
		</button>
	</fieldset>
</form>

<style>
	.error {
		color: red;
	}
</style>
