<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Modal from '$lib/components/modal.svelte'
	import {tooltip} from './tooltip-attachment'
	import * as m from '$lib/paraglide/messages'

	let showModal = $state(false)
	let recentTracks = $state([])
	let prefilledUrl = $state('')

	export function openWithUrl(url) {
		prefilledUrl = url
		showModal = true
	}

	/** @param {CustomEvent<{url: string}>} event */
	function handleGlobalModalEvent(event) {
		if (canAddTrack) {
			openWithUrl(event.detail.url)
		} else {
			goto('/auth')
		}
	}

	$effect(() => {
		window.addEventListener('r5:openAddModal', /** @type {EventListener} */ (handleGlobalModalEvent))
		return () => window.removeEventListener('r5:openAddModal', /** @type {EventListener} */ (handleGlobalModalEvent))
	})

	const channel = $derived(appState.channel)
	const isSignedIn = $derived(!!appState.user)
	const canAddTrack = $derived(isSignedIn && channel)

	/** @param {KeyboardEvent} event */
	function handleKeyDown(event) {
		const target = /** @type {HTMLElement | null} */ (event.target)
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
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

	function handleSubmit(event) {
		const {data, error} = event.detail
		if (error || !data) return

		recentTracks.unshift(data)
		if (recentTracks.length > 3) recentTracks.pop()

		prefilledUrl = ''
		showModal = false

		document.dispatchEvent(
			new CustomEvent('r5:trackAdded', {
				detail: {track: data, channelId: channel?.id}
			})
		)
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<button onclick={handleAddTrackClick} {@attach tooltip({content: m.track_add_title()})}>
	<Icon icon="add" size={20}></Icon>
</button>

<Modal bind:showModal>
	{#snippet header()}
		<h2>{m.track_add_title()}</h2>
	{/snippet}

	<r4-track-create channel_id={channel?.id} url={prefilledUrl} onsubmit={handleSubmit}></r4-track-create>

	{#if recentTracks.length > 0}
		<div class="recent-tracks">
			<h3>{m.track_recently_saved()}</h3>
			{#each recentTracks as track (track.id || track.url)}
				<div>{track.title || track.url}</div>
			{/each}
		</div>
	{/if}
</Modal>

<style>
</style>
