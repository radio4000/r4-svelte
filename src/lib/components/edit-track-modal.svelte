<script>
	import {updateTrack} from '$lib/api'
	import Modal from '$lib/components/modal.svelte'
	import {logger} from '$lib/logger'

	const log = logger.ns('edit_track_modal').seal()

	let showModal = $state(false)
	let currentTrack = $state(null)

	let editData = $state({
		title: '',
		description: '',
		url: ''
	})

	export function openWithTrack(track) {
		currentTrack = track
		editData.title = track.title || ''
		editData.description = track.description || ''
		editData.url = track.url || ''
		showModal = true
	}

	$effect(() => {
		if (showModal && currentTrack) {
			// Wait for component to render, then populate fields
			requestAnimationFrame(() => {
				const updateComponent = document.querySelector('r4-track-update')
				if (updateComponent) {
					updateComponent.setAttribute('id', currentTrack.id)
					updateComponent.setAttribute('track_id', currentTrack.id)
					updateComponent.setAttribute('title', editData.title)
					updateComponent.setAttribute('description', editData.description)
					updateComponent.setAttribute('url', editData.url)
				}
			})
		}
	})

	async function handleUpdate(event) {
		log.info('handleUpdate called', {event_detail: event.detail})

		if (!currentTrack?.id) {
			log.warn('no currentTrack available')
			return
		}

		// Update both local and remote via API
		await updateTrack(currentTrack.id, {
			title: editData.title,
			description: editData.description,
			url: editData.url
		})

		// Update the track object for immediate UI feedback
		currentTrack.title = editData.title
		currentTrack.description = editData.description
		currentTrack.url = editData.url

		showModal = false
	}
</script>

<Modal bind:showModal>
	{#snippet header()}
		<h2>Edit track</h2>
	{/snippet}

	{#key currentTrack?.id}
		<r4-track-update
			id={currentTrack?.id}
			track_id={currentTrack?.id}
			title={editData.title}
			description={editData.description}
			url={editData.url}
			onsubmit={handleUpdate}
		></r4-track-update>
	{/key}
	<menu class="actions">
		<button type="button" onclick={() => (showModal = false)}> Cancel </button>
	</menu>
</Modal>

<style>
	.actions {
		display: flex;
		flex-direction: row;
		gap: 0.5rem;
		justify-content: flex-end;
	}
</style>
