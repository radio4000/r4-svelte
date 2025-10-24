<script>
	import {goto} from '$app/navigation'
	import {useAppState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Modal from '$lib/components/modal.svelte'
	import {tooltip} from './tooltip-attachment'
	import {getTracksCollection, getChannelsCollection} from '$lib/collections'

	const appState = $derived(useAppState().data)

	let showModal = $state(false)
	let recentTracks = $state([])
	let prefilledUrl = $state('')

	export function openWithUrl(url) {
		prefilledUrl = url
		showModal = true
	}

	function handleGlobalModalEvent(event) {
		if (canAddTrack) {
			openWithUrl(event.detail.url)
		} else {
			goto('/auth')
		}
	}

	const channelId = $derived(appState?.channels?.length > 0 ? appState.channels[0] : undefined)
	const isSignedIn = $derived(!!appState?.user)
	const canAddTrack = $derived(isSignedIn && channelId)

	/** @param {KeyboardEvent} event */
	function handleKeyDown(event) {
		if (
			event.target?.tagName === 'PGLITE-REPL' ||
			event.target?.tagName === 'INPUT' ||
			event.target?.tagName === 'TEXTAREA'
		)
			return
		if (event.key === 'c' && !event.metaKey && !event.ctrlKey) {
			if (canAddTrack) {
				showModal = true
			} else {
				goto('/auth')
			}
		}
	}

	function handleAddTrackClick() {
		if (canAddTrack) {
			showModal = true
		} else {
			goto('/auth')
		}
	}

	async function submit(event) {
		const track = event.detail.data
		recentTracks.unshift(track)
		if (recentTracks.length > 3) recentTracks.pop()

		const tracksCollection = getTracksCollection()
		const channelsCollection = getChannelsCollection()

		// Get channel to denormalize channel_slug
		const channel = channelsCollection.get(channelId)
		const trackWithSlug = {
			...track,
			channel_slug: channel?.slug
		}

		// Optimistic insert via TanStack DB collection
		const tx = tracksCollection.insert(trackWithSlug)

		// Clear prefilled URL and close modal
		prefilledUrl = ''
		showModal = false

		// Wait for server persistence
		try {
			await tx.isPersisted.promise
			console.log('track added and persisted', {track: trackWithSlug})
		} catch (error) {
			console.error('track insert failed', {track: trackWithSlug, error})
			// Optimistic insert automatically rolled back
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} on:r5:openAddModal={handleGlobalModalEvent} />

<button onclick={handleAddTrackClick} {@attach tooltip({content: 'Add track'})}>
	<Icon icon="add" size={20}></Icon>
</button>

<Modal bind:showModal>
	{#snippet header()}
		<h2>Add track</h2>
	{/snippet}

	<r4-track-create channel_id={channelId} url={prefilledUrl} onsubmit={submit}></r4-track-create>

	{#if recentTracks.length > 0}
		<div class="recent-tracks">
			<h3>Recently saved:</h3>
			{#each recentTracks as track (track.id || track.url)}
				<div>{track.title || track.url}</div>
			{/each}
		</div>
	{/if}
</Modal>

<style>
</style>
