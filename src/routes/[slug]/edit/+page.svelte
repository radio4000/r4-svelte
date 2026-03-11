<script>
	import {replaceState} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {getChannelCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {channelsCollection, updateChannel} from '$lib/collections/channels'
	import MapPicker from '$lib/components/map-picker.svelte'
	import R4AvatarUpload from '$lib/components/r4-avatar-upload.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()

	// Lock to channel ID from context (ID never changes, slug might during editing)
	let channelId = $state('')
	$effect(() => {
		const found = channelCtx.data
		if (found?.id && !channelId) channelId = found.id
	})

	// Read by ID so the form stays stable when the user changes the slug
	const channel = $derived(channelId ? channelsCollection.get(channelId) : channelCtx.data)
	const isSignedIn = $derived(!!appState.user)
	const canEdit = $derived(canEditChannel(channel?.id))

	let error = $state('')
	let success = $state(false)
	let submitting = $state(false)
	let showMap = $state(false)
	let pickedLat = $state(/** @type {number|null} */ (null))
	let pickedLng = $state(/** @type {number|null} */ (null))

	const locationLat = $derived(pickedLat ?? channel?.latitude ?? null)
	const locationLng = $derived(pickedLng ?? channel?.longitude ?? null)

	function handleLocationSelect({latitude, longitude}) {
		pickedLat = latitude
		pickedLng = longitude
	}

	/** @param {SubmitEvent} event */
	async function handleSubmit(event) {
		event.preventDefault()
		if (!channel || submitting) return

		const formData = new FormData(/** @type {HTMLFormElement} */ (event.target))
		const name = /** @type {string} */ (formData.get('name'))
		const newSlug = /** @type {string} */ (formData.get('slug'))
		const description = /** @type {string} */ (formData.get('description'))
		const url = formData.get('url') || null
		const latitude = formData.get('latitude') ? Number(formData.get('latitude')) : null
		const longitude = formData.get('longitude') ? Number(formData.get('longitude')) : null

		error = ''
		success = false
		submitting = true

		try {
			const hasChanges =
				name !== (channel.name ?? '') ||
				newSlug !== (channel.slug ?? '') ||
				description !== (channel.description ?? '') ||
				url !== channel.url ||
				latitude !== channel.latitude ||
				longitude !== channel.longitude

			if (!hasChanges) {
				success = true
				return
			}

			const oldSlug = channel.slug
			await updateChannel(channel.id, {name, slug: newSlug, description, url, latitude, longitude})
			success = true
			// Update URL if slug changed (shallow routing)
			if (newSlug !== oldSlug) {
				replaceState(resolve('/[slug]/edit', {slug: newSlug}), {})
			}
		} catch (err) {
			error = /** @type {Error} */ (err).message || 'Failed to update channel'
		} finally {
			submitting = false
		}
	}
</script>

<svelte:head>
	<title>{m.channel_edit_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

<article class="constrained">
	{#if canEdit && channel}
		<!--
		<header>
			<h1>{m.channel_edit_title()} <a href={`/${channel.slug}`}>{channel.name}</a></h1>
		</header>
		-->

		{#if error}
			<p class="error" role="alert">{m.common_error()}: {error}</p>
		{/if}

		{#if success}
			<p class="success">{m.channel_updated_success()}</p>
		{/if}

		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="name">Name</label>
				<input id="name" name="name" type="text" value={channel.name ?? ''} required />
			</fieldset>

			<fieldset>
				<label for="slug">Slug</label>
				<input id="slug" name="slug" type="text" value={channel.slug ?? ''} required />
			</fieldset>

			<fieldset>
				<label for="description">Description</label>
				<textarea id="description" name="description" rows="4">{channel.description ?? ''}</textarea>
			</fieldset>

			<fieldset>
				<label for="url">URL</label>
				<input id="url" name="url" type="url" value={channel.url ?? ''} placeholder="https://..." />
			</fieldset>

			<fieldset>
				<legend>Location</legend>
				<div class="location-inputs">
					<input
						name="latitude"
						type="number"
						value={locationLat ?? ''}
						step="any"
						min="-90"
						max="90"
						placeholder="Latitude"
						onchange={(e) => (pickedLat = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
					/>
					<input
						name="longitude"
						type="number"
						value={locationLng ?? ''}
						step="any"
						min="-180"
						max="180"
						placeholder="Longitude"
						onchange={(e) => (pickedLng = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
					/>
					<button type="button" onclick={() => (showMap = !showMap)}>
						{showMap ? 'Hide map' : 'Pick on map'}
					</button>
				</div>
				{#if showMap}
					<div class="map-container">
						<MapPicker latitude={locationLat} longitude={locationLng} onselect={handleLocationSelect} />
					</div>
				{/if}
			</fieldset>

			<fieldset>
				<legend>Image</legend>
				<R4AvatarUpload slug={channel.slug} channelId={channel.id} />
			</fieldset>

			<button class="primary" type="submit" disabled={submitting}>
				{submitting ? m.common_save() + '...' : m.common_save()}
			</button>
		</form>

		<p><a href={resolve('/[slug]/delete', {slug: channel.slug})}>{m.common_delete()} channel</a></p>
	{:else if !isSignedIn}
		<p><a href={resolve('/auth')}>{m.auth_sign_in_to_edit()}</a></p>
	{:else}
		<p>Loading...</p>
	{/if}
</article>

<style>
	.form {
		margin-block: 0rem 4rem;
	}
	.location-inputs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.location-inputs input {
		flex: 1;
		min-width: 8rem;
	}
	.map-container {
		margin-top: 0.5rem;
		height: 300px;
		position: relative;
	}
	.map-container :global(.map) {
		height: 100%;
	}
</style>
