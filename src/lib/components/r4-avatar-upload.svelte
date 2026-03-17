<script>
	import {sdk} from '@radio4000/sdk'
	import {updateChannel} from '$lib/collections/channels'
	import {channelAvatarUrl} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	/** @type {{slug: string, channelId: string, image?: string | null, onupload?: (data: unknown) => void}} */
	let {slug, channelId, image = null, onupload} = $props()
	let loading = $state(false)
	let error = $state(/** @type {string|null} */ (null))
	let success = $state(false)
	let previewUrl = $state(/** @type {string|null} */ (null))

	const currentUrl = $derived(previewUrl ?? (image ? channelAvatarUrl(image) : null))

	async function handleChange(event) {
		const file = /** @type {HTMLInputElement} */ (event.target).files?.[0]
		if (!file) return
		previewUrl = URL.createObjectURL(file)
		error = null
		success = false
		loading = true
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
			previewUrl = null
		} finally {
			loading = false
		}
	}
</script>

<div class="avatar-upload">
	<label class="avatar-area" class:loading class:success title={m.avatar_upload_label()}>
		{#if currentUrl}
			<img src={currentUrl} alt={m.avatar_upload_label()} />
		{:else}
			<span class="placeholder">+</span>
		{/if}
		{#if loading}
			<span class="overlay">…</span>
		{:else if success}
			<span class="overlay">✓</span>
		{/if}
		<input type="file" name="file" accept="image/*" onchange={handleChange} />
	</label>
	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.avatar-upload {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.avatar-area {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 6rem;
		height: 6rem;
		border-radius: var(--border-radius);
		border: 2px dashed var(--gray-6);
		overflow: hidden;
		cursor: pointer;
		transition: border-color 0.15s, opacity 0.15s;

		&:hover, &:focus-within {
			border-color: var(--accent-9);
		}

		&.loading {
			opacity: 0.7;
		}

		&.success {
			border-style: solid;
			border-color: var(--accent-9);
		}
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.placeholder {
		font-size: 2rem;
		color: var(--gray-7);
		line-height: 1;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: light-dark(rgb(255 255 255 / 0.7), rgb(0 0 0 / 0.5));
		font-size: 1.5rem;
	}

	input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		width: 100%;
		height: 100%;
	}
</style>
