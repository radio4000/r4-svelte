<script>
	/**
	 * Asks an admin for a code from their authenticator app (2FA). The database needs a code from
	 * the last 15 minutes to quarantine or release, so that an admin's radio left signed in can't
	 * (radio4000/supabase docs/moderation.md). The app is added in /account/2fa.
	 * `ask()` resolves true once a code is verified, false if the dialog is closed.
	 */
	import {resolve as resolvePath} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import Dialog from '#lib/components/dialog.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const mfa = sdk.supabase.auth.mfa

	let showModal = $state(false)
	/** The authenticator app to verify; null until loaded, or if the account has none. */
	let factorId = $state(/** @type {string | null} */ (null))
	let loaded = $state(false)
	let code = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)
	let verified = false
	/** @type {((ok: boolean) => void) | null} */
	let resolve = null

	export async function ask() {
		code = ''
		error = null
		factorId = null
		loaded = false
		verified = false
		showModal = true
		const answer = new Promise((r) => (resolve = r))
		const {data, error: err} = await mfa.listFactors()
		if (err) error = err.message
		else factorId = data.totp[0]?.id ?? null
		loaded = true
		return answer
	}

	async function verify(event) {
		event.preventDefault()
		if (!factorId) return
		loading = true
		error = null
		const {error: err} = await mfa.challengeAndVerify({factorId, code})
		loading = false
		if (err) {
			error = err.message
			return
		}
		verified = true
		setOpen(false)
	}

	/** Open or close; closing answers `ask()`. */
	function setOpen(open) {
		showModal = open
		if (open || !resolve) return
		resolve(verified)
		resolve = null
	}
</script>

<Dialog bind:showModal={() => showModal, setOpen}>
	{#snippet header()}
		<h2>{m.moderation_code_title()}</h2>
	{/snippet}
	{#if loaded && !factorId && !error}
		<p>{m.moderation_code_setup()}</p>
		<a class="btn primary" href={resolvePath('/account/2fa')}>{m.account_2fa_add()}</a>
	{:else}
		<p>{m.moderation_code_needed()}</p>
		<form class="form" onsubmit={verify}>
			<fieldset>
				<label for="admin-code">{m.account_2fa_code()}</label>
				<input
					id="admin-code"
					type="text"
					inputmode="numeric"
					bind:value={code}
					required
					disabled={!factorId || loading}
					minlength="6"
					maxlength="6"
					placeholder="123456"
					autocomplete="one-time-code"
				/>
			</fieldset>
			<button type="submit" class="primary" disabled={!factorId || loading || code.length < 6}>
				{loading ? '…' : m.account_2fa_verify()}
			</button>
		</form>
	{/if}
	{#if error}
		<p role="alert">{error}</p>
	{/if}
</Dialog>
