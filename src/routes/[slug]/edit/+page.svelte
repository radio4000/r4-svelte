<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {getChannelCtx} from '$lib/contexts'
	import {appState, canEditChannel} from '$lib/app-state.svelte'
	import {updateChannel} from '$lib/collections/channels'
	import MapPicker from '$lib/components/map-picker.svelte'
	import R4AvatarUpload from '$lib/components/r4-avatar-upload.svelte'
	import ChannelNavControlsPortal from '$lib/components/channel-nav-controls-portal.svelte'
	import * as m from '$lib/paraglide/messages'

	const channelCtx = getChannelCtx()

	// Layout provides a reactive ID-based query — stable across slug changes
	const channel = $derived(channelCtx.data)
	const isSignedIn = $derived(!!appState.user)
	const canEdit = $derived(canEditChannel(channel?.id))

	let error = $state('')
	let success = $state(false)
	let submitting = $state(false)
	let showMap = $state(false)
	let pickedLat = $state(/** @type {number|null} */ (null))
	let pickedLng = $state(/** @type {number|null} */ (null))

	// Form field state — initialized from channel once it loads
	let fieldName = $state('')
	let fieldSlug = $state('')
	let fieldDescription = $state('')
	let fieldUrl = $state('')
	let initialized = $state(false)

	$effect(() => {
		if (channel && !initialized) {
			fieldName = channel.name ?? ''
			fieldSlug = channel.slug ?? ''
			fieldDescription = channel.description ?? ''
			fieldUrl = channel.url ?? ''
			pickedLat = channel.latitude ?? null
			pickedLng = channel.longitude ?? null
			initialized = true
		}
	})

	const locationLat = $derived(pickedLat ?? channel?.latitude ?? null)
	const locationLng = $derived(pickedLng ?? channel?.longitude ?? null)

	const hasChanges = $derived.by(() => {
		if (!channel || !initialized) return false
		return (
			fieldName !== (channel.name ?? '') ||
			fieldSlug !== (channel.slug ?? '') ||
			fieldDescription !== (channel.description ?? '') ||
			fieldUrl !== (channel.url ?? '') ||
			pickedLat !== (channel.latitude ?? null) ||
			pickedLng !== (channel.longitude ?? null)
		)
	})

	function handleLocationSelect({latitude, longitude}) {
		pickedLat = latitude
		pickedLng = longitude
	}

	async function handleSubmit(event) {
		event?.preventDefault()
		if (!channel || submitting || !hasChanges) return

		error = ''
		success = false
		submitting = true

		try {
			const oldSlug = channel.slug
			await updateChannel(channel.id, {
				name: fieldName,
				slug: fieldSlug,
				description: fieldDescription,
				url: fieldUrl || null,
				latitude: pickedLat,
				longitude: pickedLng
			})
			success = true
			initialized = false // re-sync after save so hasChanges resets
			if (fieldSlug !== oldSlug) {
				await goto(resolve('/[slug]/edit', {slug: fieldSlug}), {replaceState: true})
			}
		} catch (err) {
			error = /** @type {Error} */ (err).message || m.channel_edit_failed()
		} finally {
			submitting = false
		}
	}
</script>

<svelte:head>
	<title>{m.channel_edit_page_title({name: channel?.name || m.channel_page_fallback()})}</title>
</svelte:head>

<ChannelNavControlsPortal controls={navControls} />

{#snippet navControls()}
	<button class="primary" type="button" onclick={handleSubmit} disabled={!hasChanges || submitting}>
		{submitting ? m.common_save() + '…' : m.common_save()}
	</button>
{/snippet}

<article>
	{#if canEdit && channel}
		<div class="card">
			{#if error}
				<p class="error" role="alert">{m.common_error()}: {error}</p>
			{/if}

			{#if success}
				<p class="success">{m.channel_updated_success()}</p>
			{/if}

			<form class="form" onsubmit={handleSubmit}>
				<fieldset>
					<legend>{m.common_image()}</legend>
					<R4AvatarUpload slug={channel.slug} channelId={channel.id} image={channel.image} />
				</fieldset>

				<fieldset>
					<label for="name">{m.common_name()}</label>
					<input id="name" name="name" type="text" bind:value={fieldName} required />
				</fieldset>

				<fieldset>
					<label for="slug">{m.channel_edit_slug_label()}</label>
					<input id="slug" name="slug" type="text" bind:value={fieldSlug} required />
				</fieldset>

				<fieldset>
					<label for="description">{m.common_description()}</label>
					<textarea id="description" name="description" rows="4" bind:value={fieldDescription}
					></textarea>
				</fieldset>

				<fieldset>
					<legend>{m.common_location()}</legend>
					<div class="location-inputs">
						<input
							name="latitude"
							type="number"
							value={locationLat ?? ''}
							step="any"
							min="-90"
							max="90"
							placeholder={m.common_latitude()}
							onchange={(e) =>
								(pickedLat = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
						/>
						<input
							name="longitude"
							type="number"
							value={locationLng ?? ''}
							step="any"
							min="-180"
							max="180"
							placeholder={m.common_longitude()}
							onchange={(e) =>
								(pickedLng = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
						/>
						<button type="button" onclick={() => (showMap = !showMap)}>
							{showMap ? m.channel_edit_hide_map() : m.channel_edit_pick_on_map()}
						</button>
					</div>
					{#if showMap}
						<div class="map-container">
							<MapPicker
								latitude={locationLat}
								longitude={locationLng}
								onselect={handleLocationSelect}
							/>
						</div>
					{/if}
				</fieldset>

				<fieldset>
					<label for="url">{m.common_url()}</label>
					<input
						id="url"
						name="url"
						type="url"
						bind:value={fieldUrl}
						placeholder={m.track_form_url_placeholder()}
					/>
				</fieldset>
			</form>
		</div>

		<p class="delete-link">
			<a href={resolve('/[slug]/delete', {slug: channel.slug})}>{m.channel_delete_button()}</a>
		</p>
	{:else if !isSignedIn}
		<p><a href={resolve('/auth')}>{m.auth_sign_in_to_edit()}</a></p>
	{:else}
		<p>{m.common_loading()}</p>
	{/if}
</article>

<style>
	article {
		padding: 1rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: 1.25rem;
	}

	.form {
		gap: 1.25rem;
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

	.delete-link {
		font-size: var(--font-3);
	}
</style>
