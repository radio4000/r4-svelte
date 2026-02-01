<script>
	import {sdk} from '@radio4000/sdk'

	let {slug, onupload} = $props()
	let loading = $state(false)

	async function handleSubmit(event) {
		event.preventDefault()
		const files = event.target.file.files
		for (const file of files) {
			loading = true
			try {
				const res = await sdk.channels.createImage(file, slug)
				const data = await res.json()
				onupload?.(data)
			} catch (err) {
				console.error('Upload failed:', err)
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
		<button type="submit" disabled={loading}>Upload avatar</button>
	</fieldset>
</form>
