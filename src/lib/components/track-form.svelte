<script lang="ts">
	import {addTrack, updateTrack} from '$lib/collections/tracks'
	import {getMedia, parseUrl} from 'media-now'
	import {searchUrl} from '$lib/metadata/discogs'
	import R4DiscogsResource from '$lib/components/r4-discogs-resource.svelte'
	import * as m from '$lib/paraglide/messages'
	import {extractHashtags} from '$lib/utils'
	import type {Channel} from '$lib/collections/channels'

	type SubmitData = {id?: string; url: string; title: string}
	type SubmitEvent_ = {data: SubmitData | null; error: Error | null}

	type Props =
		| {
				mode: 'create'
				channel: Channel
				trackId?: string
				url?: string
				title?: string
				description?: string
				discogs_url?: string
				onsubmit?: (event: SubmitEvent_) => void
		  }
		| {
				mode: 'edit'
				channel: {id: string; slug: string}
				trackId: string
				url?: string
				title?: string
				description?: string
				discogs_url?: string
				onsubmit?: (event: SubmitEvent_) => void
		  }

	const uid = $props.id()

	let {
		mode,
		channel,
		trackId,
		url: initialUrl = '',
		title: initialTitle = '',
		description: initialDescription = '',
		discogs_url: initialDiscogsUrl = '',
		onsubmit
	}: Props = $props()

	let error = $state('')
	let submitting = $state(false)
	let fetchingTitle = $state(false)
	let liveTitle = $state('')
	let liveDiscogsUrl = $state('')
	let allDiscogsSuggestions = $state<string[]>([])

	let titleInput = $state<HTMLInputElement>()
	let urlInput = $state<HTMLInputElement>()
	let descriptionInput = $state<HTMLTextAreaElement>()
	let pendingUrl = ''

	$effect(() => {
		liveTitle = initialTitle
		liveDiscogsUrl = initialDiscogsUrl
	})

	async function handleUrlInput(event: Event) {
		const input = event.target as HTMLInputElement
		if (!input.validity.valid || !input.value || titleInput?.value) return
		const url = input.value
		pendingUrl = url
		fetchingTitle = true
		try {
			const media = await getMedia(url)
			if (media?.title && titleInput && !titleInput.value && url === pendingUrl) {
				titleInput.value = media.title
				liveTitle = media.title
			}
		} finally {
			if (url === pendingUrl) fetchingTitle = false
		}
	}

	function handleDiscogsSuggestion(event: {detail: string[]}) {
		const selected = event.detail
		if (!descriptionInput) return
		let desc = descriptionInput.value
		for (const tag of allDiscogsSuggestions) {
			desc = desc.replace(new RegExp(`(?:^|\\s)#${tag}(?=\\s|$)`, 'gi'), '').trim()
		}
		const hashtags = selected.map((t) => `#${t}`).join(' ')
		descriptionInput.value = hashtags ? (desc ? `${desc} ${hashtags}` : hashtags) : desc
	}

	function handleDiscogsSelectMedia(uri: string, title: string) {
		if (!uri) return
		if (urlInput) urlInput.value = uri
		if (titleInput) {
			titleInput.value = title
			liveTitle = title
		}
		pendingUrl = uri
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault()
		if (submitting) return

		const formData = new FormData(event.target as HTMLFormElement)
		const url = formData.get('url') as string
		const title = formData.get('title') as string
		const description = formData.get('description') as string
		const discogs_url = formData.get('discogs_url') as string

		if (!url || !title) return

		error = ''
		submitting = true

		try {
			let newTrackId: string | undefined
			if (mode === 'create') {
				newTrackId = await addTrack(channel, {
					url,
					title,
					description: description || undefined,
					discogs_url: discogs_url || undefined
				})
			} else {
				if (!trackId) throw new Error('Track ID required for update')

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
			onsubmit?.({data: {id: newTrackId, url, title}, error: null})
			if (mode === 'create') {
				const form = event.target as HTMLFormElement | null
				form?.reset()
			}
		} catch (err) {
			error = (err as Error).message || 'Failed to save track'
			onsubmit?.({data: null, error: err as Error})
		} finally {
			submitting = false
		}
	}

	const hasDiscogsReleaseUrl = $derived.by(() => {
		const parsed = parseUrl(liveDiscogsUrl?.trim() || '')
		return parsed?.provider === 'discogs'
	})
	const isValidDiscogsUrl = $derived(hasDiscogsReleaseUrl)
	const discogsActionUrl = $derived.by(() => {
		const releaseUrl = liveDiscogsUrl?.trim()
		if (hasDiscogsReleaseUrl && releaseUrl) return releaseUrl
		const title = liveTitle?.trim()
		if (!title) return ''
		return searchUrl(title)?.searchUrl || ''
	})
</script>

{#if error}
	<p class="error" role="alert">{m.common_error()}: {error}</p>
{/if}

<form class="form" onsubmit={handleSubmit}>
	<fieldset>
		<label for="{uid}-url">URL</label>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:this={urlInput}
			id="{uid}-url"
			name="url"
			type="url"
			value={initialUrl}
			oninput={handleUrlInput}
			required
			autofocus
			placeholder="https://..."
		/>
	</fieldset>

	<fieldset>
		<label for="{uid}-title">Title {fetchingTitle ? '...' : ''}</label>
		<input
			bind:this={titleInput}
			bind:value={liveTitle}
			id="{uid}-title"
			name="title"
			type="text"
			required
			placeholder={m.track_form_title_placeholder()}
		/>
	</fieldset>

	<fieldset>
		<label for="{uid}-description">Description</label>
		<textarea
			bind:this={descriptionInput}
			id="{uid}-description"
			name="description"
			rows="2"
			placeholder={m.track_form_description_placeholder()}>{initialDescription}</textarea
		>
	</fieldset>

	<fieldset>
		<label for="{uid}-discogs_url">
			Discogs URL
			{#if mode === 'create' && discogsActionUrl}
				(
				<a
					{...{href: discogsActionUrl, target: '_blank', rel: 'noopener noreferrer'}}
					onclick={(event) => event.stopPropagation()}>{m.track_meta_view_discogs()}</a
				>
				)
			{/if}
		</label>
		<input
			bind:value={liveDiscogsUrl}
			id="{uid}-discogs_url"
			name="discogs_url"
			type="url"
			placeholder={m.track_form_discogs_placeholder()}
		/>
	</fieldset>

	{#if isValidDiscogsUrl}
		<R4DiscogsResource
			url={liveDiscogsUrl}
			full={mode === 'create'}
			suggestions={true}
			preselected={extractHashtags(initialDescription).map((t) => t.slice(1))}
			onload={(all) => (allDiscogsSuggestions = all)}
			onsuggestion={handleDiscogsSuggestion}
			onSelectMedia={mode === 'create' ? handleDiscogsSelectMedia : undefined}
		/>
	{/if}

	<button type="submit" disabled={submitting}>
		{submitting ? m.common_save() + '...' : mode === 'create' ? m.track_add_title() : m.common_save()}
	</button>
</form>
