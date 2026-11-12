<script>
	/**
	 * Asks an admin for a code from their authenticator app (2FA), and sets the app up the first
	 * time. The database needs a code from the last 15 minutes to quarantine or release, so that an
	 * admin's radio left signed in can't (radio4000/supabase docs/moderation.md).
	 * `ask()` resolves true once a code is verified, false if the dialog is closed.
	 */
	import {sdk} from '@radio4000/sdk'
	import Dialog from '#lib/components/dialog.svelte'

	const mfa = sdk.supabase.auth.mfa

	let showModal = $state(false)
	/** The app to verify; a new one has its QR code and secret. */
	let factor = $state(/** @type {{id: string, qr_code?: string, secret?: string} | null} */ (null))
	let code = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let loading = $state(false)
	let verified = false
	/** @type {((ok: boolean) => void) | null} */
	let resolve = null

	export async function ask() {
		code = ''
		error = null
		factor = null
		verified = false
		showModal = true
		const answer = new Promise((r) => (resolve = r))
		const {data, error: listError} = await mfa.listFactors()
		if (listError) {
			error = listError.message
		} else if (data.totp[0]) {
			factor = {id: data.totp[0].id}
		} else {
			// A setup left unfinished blocks a new one.
			for (const old of data.all) {
				if (old.factor_type === 'totp') await mfa.unenroll({factorId: old.id})
			}
			const {data: added, error: enrollError} = await mfa.enroll({
				factorType: 'totp',
				friendlyName: `radio4000.com ${new Date().toISOString()}`
			})
			if (enrollError) error = enrollError.message
			else factor = {id: added.id, qr_code: added.totp.qr_code, secret: added.totp.secret}
		}
		return answer
	}

	async function verify(event) {
		event.preventDefault()
		if (!factor) return
		loading = true
		error = null
		const {error: verifyError} = await mfa.challengeAndVerify({factorId: factor.id, code})
		loading = false
		if (verifyError) {
			error = verifyError.message
			return
		}
		verified = true
		setOpen(false)
	}

	/** Open or close; closing answers, removes an unfinished setup, and forgets the secret. */
	function setOpen(open) {
		showModal = open
		if (open || !resolve) return
		if (!verified && factor?.secret) mfa.unenroll({factorId: factor.id})
		resolve(verified)
		resolve = null
		if (factor) factor = {id: factor.id}
	}
</script>

<Dialog bind:showModal={() => showModal, setOpen}>
	{#snippet header()}
		<h2>Admin code</h2>
	{/snippet}
	{#if factor?.qr_code}
		<p>
			To quarantine and release, admins type a code from an authenticator app, so that a radio left
			signed in can't. Scan this QR code with your app, once, then type its code.
		</p>
		<img
			class="qr"
			src={factor.qr_code}
			alt="QR code adding radio4000.com to your authenticator app"
			width="200"
			height="200"
		/>
		<p>Or add this key in the app: <code>{factor.secret}</code></p>
	{:else if factor}
		<p>Type the code from your authenticator app. It lets you moderate for 15 minutes.</p>
	{:else if !error}
		<p>Loading…</p>
	{/if}
	<form class="form" onsubmit={verify}>
		<fieldset>
			<label for="admin-code">Code</label>
			<input
				id="admin-code"
				type="text"
				inputmode="numeric"
				bind:value={code}
				required
				disabled={!factor || loading}
				minlength="6"
				maxlength="6"
				placeholder="123456"
				autocomplete="one-time-code"
			/>
		</fieldset>
		<button type="submit" class="primary" disabled={!factor || loading || code.length < 6}>
			{loading ? '…' : 'Verify'}
		</button>
	</form>
	{#if error}
		<p role="alert">{error}</p>
	{/if}
</Dialog>

<style>
	/* The QR code is dark on transparent: readable in dark themes too. */
	.qr {
		display: block;
		background: white;
		padding: var(--space-2);
		border-radius: var(--border-radius);
	}
</style>
