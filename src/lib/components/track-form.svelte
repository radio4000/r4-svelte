<script>
	import {untrack} from 'svelte'
	import {addTrack, updateTrack} from '$lib/tanstack/collections/tracks'
	import {getMedia} from 'media-now'
	import R4DiscogsResource from '$lib/components/r4-discogs-resource.svelte'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	/** @type {{mode: 'create', channel: import('$lib/tanstack/collections/channels').Channel, trackId?: string, url?: string, title?: string, description?: string, discogs_url?: string, onsubmit?: (event: {data: {url: string, title: string} | null, error: Error | null}) => void} | {mode: 'edit', channel: {id: string, slug: string}, trackId: string, url?: string, title?: string, description?: string, discogs_url?: string, onsubmit?: (event: {data: {url: string, title: string} | null, error: Error | null}) => void}} */
	let {
		mode,
		channel,
		trackId,
		url: initialUrl = '',
		title: initialTitle = '',
		description: initialDescription = '',
		discogs_url: initialDiscogsUrl = '',
		onsubmit
	} = $props()

	let error = $state('')
	let submitting = $state(false)
	let fetchingTitle = $state(false)
	let liveDiscogsUrl = $state(untrack(() => initialDiscogsUrl))
	/** All possible suggestion tags from the loaded discogs resource */
	let allDiscogsSuggestions = $state(/** @type {string[]} */ ([]))

	/** @type {HTMLInputElement | undefined} */
	let titleInput = $state()
	/** @type {HTMLTextAreaElement | undefined} */
	let descriptionInput = $state()
	let pendingUrl = ''

	async function handleUrlInput(event) {
		const input = /** @type {HTMLInputElement} */ (event.target)
		if (!input.validity.valid || !input.value || titleInput?.value) return
		const url = input.value
		pendingUrl = url
		fetchingTitle = true
		try {
			const media = await getMedia(url)
			if (media?.title && titleInput && !titleInput.value && url === pendingUrl) {
				titleInput.value = media.title
			}
		} finally {
			if (url === pendingUrl) fetchingTitle = false
		}
	}

	/** Extract hashtag words from text (without the # prefix, lowercased) */
	function parseHashtags(text) {
		return [...(text ?? '').matchAll(/#([\w-]+)/g)].map((m) => m[1].toLowerCase())
	}

	/** @param {{detail: string[]}} event */
	function handleDiscogsSuggestion(event) {
		const selected = event.detail
		if (!descriptionInput) return
		let desc = descriptionInput.value
		// Remove all current discogs suggestions from description (clean slate for this section)
		for (const tag of allDiscogsSuggestions) {
			desc = desc.replace(new RegExp(`(?:^|\\s)#${tag}(?=\\s|$)`, 'gi'), '').trim()
		}
		// Re-add selected ones
		const hashtags = selected.map((t) => `#${t}`).join(' ')
		descriptionInput.value = hashtags ? (desc ? `${desc} ${hashtags}` : hashtags) : desc
	}

	/** @param {SubmitEvent} event */
	async function handleSubmit(event) {
		event.preventDefault()
		if (submitting) return

		const formData = new FormData(/** @type {HTMLFormElement} */ (event.target))
		const url = /** @type {string} */ (formData.get('url'))
		const title = /** @type {string} */ (formData.get('title'))
		const description = /** @type {string} */ (formData.get('description'))
		const discogs_url = /** @type {string} */ (formData.get('discogs_url'))

		if (!url || !title) return

		error = ''
		submitting = true

		try {
			if (mode === 'create') {
				await addTrack(channel, {
					url,
					title,
					description: description || undefined,
					discogs_url: discogs_url || undefined
				})
			} else {
				if (!trackId) throw new Error('Track ID required for update')

				// Skip update if nothing changed
				const hasChanges =
					url !== initialUrl ||
					title !== initialTitle ||
					description !== initialDescription ||
					discogs_url !== initialDiscogsUrl

				if (hasChanges) {
					await updateTrack(channel, trackId, {
						url,
						title,
						description: description || undefined,
						discogs_url: discogs_url || undefined
					})
				}
			}
			onsubmit?.({data: {url, title}, error: null})
			if (mode === 'create') {
				const form = /** @type {HTMLFormElement | null} */ (event.target)
				form?.reset()
			}
		} catch (err) {
			error = /** @type {Error} */ (err).message || 'Failed to save track'
			onsubmit?.({data: null, error: /** @type {Error} */ (err)})
		} finally {
			submitting = false
		}
	}

	const isValidDiscogsUrl = $derived(liveDiscogsUrl?.includes('discogs.com'))
</script>

{#if error}
	<p class="error" role="alert">{m.common_error()}: {error}</p>
{/if}

<form class="form" onsubmit={handleSubmit}>
	<fieldset>
		<label for="{uid}-url">URL</label>
		<input
			id="{uid}-url"
			name="url"
			type="url"
			value={initialUrl}
			oninput={handleUrlInput}
			required
			placeholder="https://..."
		/>
	</fieldset>

	<fieldset>
		<label for="{uid}-title">Title {fetchingTitle ? '...' : ''}</label>
		<input
			bind:this={titleInput}
			id="{uid}-title"
			name="title"
			type="text"
			value={initialTitle}
			required
			placeholder="Track title"
		/>
	</fieldset>

	<fieldset>
		<label for="{uid}-description">Description</label>
		<textarea
			bind:this={descriptionInput}
			id="{uid}-description"
			name="description"
			rows="2"
			placeholder="Optional description">{initialDescription}</textarea
		>
	</fieldset>

	<fieldset>
		<label for="{uid}-discogs_url">Discogs URL</label>
		<input
			id="{uid}-discogs_url"
			name="discogs_url"
			type="url"
			value={initialDiscogsUrl}
			oninput={(e) => (liveDiscogsUrl = /** @type {HTMLInputElement} */ (e.target).value)}
			placeholder="https://discogs.com/release/..."
		/>
	</fieldset>

	{#if isValidDiscogsUrl}
		<R4DiscogsResource
			url={liveDiscogsUrl}
			suggestions={true}
			preselected={parseHashtags(initialDescription)}
			onload={(all) => (allDiscogsSuggestions = all)}
			onsuggestion={handleDiscogsSuggestion}
		/>
	{/if}

	<button type="submit" disabled={submitting}>
		{submitting ? m.common_save() + '...' : mode === 'create' ? m.track_add_title() : m.common_save()}
	</button>
</form>
