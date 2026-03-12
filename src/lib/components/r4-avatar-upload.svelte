<script>
	import {sdk} from '@radio4000/sdk'
	import {updateChannel} from '$lib/collections/channels'
	import * as m from '$lib/paraglide/messages'

	/** @type {{slug: string, channelId: string, onupload?: (data: unknown) => void}} */
	let {slug, channelId, onupload} = $props()
	let loading = $state(false)
	let error = $state(/** @type {string|null} */ (null))
	let success = $state(false)

	async function handleSubmit(event) {
		event.preventDefault()
		const files = event.target.file.files
		for (const file of files) {
			loading = true
			error = null
			success = false
			try {
				const res = await sdk.channels.createImage(file, slug)
				if (!res.ok) {
					const body = await res.json().catch(() => null)
					throw new Error(body?.message || body?.error || `${m.avatar_upload_failed()} (${res.status})`)
				}
				const data = await res.json()
				if (!data?.public_id) throw new Error(m.avatar_upload_missing_id())
				await updateChannel(channelId, {image: data.public_id})
				success = true
				onupload?.(data)
			} catch (err) {
				error = /** @type {Error} */ (err).message || m.avatar_upload_failed()
			} finally {
				loading = false
			}
		}
	}
</script>

<form method="post" enctype="multipart/form-data" onsubmit={handleSubmit}>
	<fieldset>
		<label for="file">{m.avatar_upload_label()}</label>
		<input id="file" type="file" name="file" required />
	</fieldset>
	<fieldset>
		<button type="submit" disabled={loading}>{loading ? m.avatar_uploading() : m.avatar_upload_button()}</button>
	</fieldset>
	{#if success}
		<p class="success">{m.avatar_upload_success()}</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</form>
