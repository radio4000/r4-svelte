<script>
	/**
	 * Authenticator apps (2FA, TOTP) of the account. Admins need a code from one to quarantine and
	 * release (radio4000/supabase docs/moderation.md); signing in doesn't ask for it.
	 */
	import {resolve} from '$app/paths'
	import {sdk} from '@radio4000/sdk'
	import {appState} from '#lib/app-state.svelte.js'
	import {appName} from '#lib/config.js'
	import BackLink from '#lib/components/back-link.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const mfa = sdk.supabase.auth.mfa

	/** @type {Array<{id: string, friendly_name?: string}>} */
	let apps = $state([])
	/** The app being added, with its QR code and secret, until its first code is verified. */
	let adding = $state(/** @type {{id: string, qr_code: string, secret: string} | null} */ (null))
	/** The app to remove once a code is verified: removing needs a recent code. */
	let removing = $state(/** @type {string | null} */ (null))
	let code = $state('')
	let error = $state(/** @type {string | null} */ (null))
	let notice = $state(/** @type {string | null} */ (null))
	let loading = $state(false)

	$effect(() => {
		if (appState.user) load()
	})

	async function load() {
		const {data, error: err} = await mfa.listFactors()
		if (err) error = err.message
		else apps = data.totp
	}

	async function add() {
		error = null
		notice = null
		loading = true
		// A setup left unfinished blocks a new one.
		const {data} = await mfa.listFactors()
		for (const old of data?.all ?? []) {
			if (old.factor_type === 'totp' && old.status !== 'verified') {
				await mfa.unenroll({factorId: old.id})
			}
		}
		const {data: added, error: err} = await mfa.enroll({
			factorType: 'totp',
			friendlyName: `${appName} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
		})
		loading = false
		if (err) error = err.message
		else adding = {id: added.id, qr_code: added.totp.qr_code, secret: added.totp.secret}
	}

	async function cancel() {
		if (adding) await mfa.unenroll({factorId: adding.id})
		adding = null
		removing = null
		code = ''
		error = null
	}

	async function remove(id) {
		if (!confirm(m.account_2fa_remove_confirm())) return
		error = null
		notice = null
		const {data} = await mfa.getAuthenticatorAssuranceLevel()
		if (data?.currentLevel === 'aal2') await unenroll(id)
		else removing = id
	}

	async function unenroll(id) {
		const {error: err} = await mfa.unenroll({factorId: id})
		if (err) error = err.message
		else notice = m.account_2fa_removed()
		removing = null
		await load()
	}

	async function verify(event) {
		event.preventDefault()
		const id = adding?.id ?? removing
		if (!id) return
		error = null
		loading = true
		const {error: err} = await mfa.challengeAndVerify({factorId: id, code})
		loading = false
		if (err) {
			error = err.message
			return
		}
		code = ''
		if (removing) {
			await unenroll(removing)
		} else {
			adding = null
			notice = m.account_2fa_added()
			await load()
		}
	}
</script>

<Seo title={m.account_2fa()} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/account')} />
		<h1>{m.account_2fa()}</h1>
	</header>

	{#if !appState.user}
		<p><a href={resolve('/auth')}>{m.account_sign_in_prompt()}</a></p>
	{:else}
		<p>{m.account_2fa_intro({appName})}</p>

		{#if notice}
			<p role="status">{notice}</p>
		{/if}

		{#if adding || removing}
			{#if adding}
				<p>{m.account_2fa_scan()}</p>
				<img
					class="qr"
					src={adding.qr_code}
					alt={m.account_2fa_qr_alt({appName})}
					width="200"
					height="200"
				/>
				<p>{m.account_2fa_key()} <code>{adding.secret}</code></p>
			{:else}
				<p>{m.account_2fa_code_to_remove()}</p>
			{/if}
			<form class="form" onsubmit={verify}>
				<fieldset>
					<label for="code">{m.account_2fa_code()}</label>
					<input
						id="code"
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
				<menu>
					<button type="submit" class="primary" disabled={loading || code.length < 6}>
						{loading ? '…' : m.account_2fa_verify()}
					</button>
					<button type="button" onclick={cancel}>{m.account_2fa_cancel()}</button>
				</menu>
			</form>
		{:else}
			<section>
				<menu class="nav-vertical">
					{#each apps as app (app.id)}
						<div>
							<p>{app.friendly_name || m.account_2fa_app()}</p>
							<button onclick={() => remove(app.id)}>{m.account_2fa_remove()}</button>
						</div>
					{:else}
						<div><p>{m.account_2fa_none()}</p></div>
					{/each}
				</menu>
			</section>
			<button class="primary" onclick={add} disabled={loading}>
				{loading ? '…' : m.account_2fa_add()}
			</button>
		{/if}

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	{/if}
</article>

<style>
	section {
		margin: 0 0 1rem;
	}
	div {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;

		@media (min-width: 520px) {
			flex-direction: row;
			justify-content: space-between;
			align-items: center;
		}
	}
	/* The QR code is dark on transparent: readable in dark themes too. */
	.qr {
		display: block;
		background: white;
		padding: var(--space-2);
		border-radius: var(--border-radius);
	}
</style>
