<script>
	import {sdk} from '@radio4000/sdk'

	/** @type {{slug: string, onupload?: (data: unknown) => void}} */
	let {slug, onupload} = $props()
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
					throw new Error(body?.message || body?.error || `Upload failed (${res.status})`)
				}
				const data = await res.json().catch(() => null)
				success = true
				onupload?.(data)
			} catch (err) {
				error = /** @type {Error} */ (err).message || 'Upload failed'
			} finally {
				loading = false
			}
		}
	}
</script>

<form method="post" enctype="multipart/form-data" onsubmit={handleSubmit}>
	<fieldset>
		<label for="file">Upload an image</label>
		<input id="file" type="file" name="file" required />
	</fieldset>
	<fieldset>
		<button type="submit" disabled={loading}>{loading ? 'Uploading...' : 'Upload avatar'}</button>
	</fieldset>
	{#if success}
		<p class="success">Image uploaded!</p>
	{/if}
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</form>
