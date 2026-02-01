<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Modal from '$lib/components/modal.svelte'
	import TrackForm from '$lib/components/track-form.svelte'
	import {tooltip} from './tooltip-attachment'
	import * as m from '$lib/paraglide/messages'

	let showModal = $state(false)
	let recentTracks = $state([])
	let trackData = $state({url: '', title: '', description: ''})

	const channel = $derived(appState.channel)
	const isSignedIn = $derived(!!appState.user)

	/** @param {{track?: import('$lib/types').Track, url?: string}} [data] */
	function open(data = {}) {
		if (!isSignedIn) {
			goto('/auth')
			return
		}
		if (!channel) {
			goto('/create-channel')
			return
		}
		const track = data.track
		if (track) {
			trackData = {
				url: track.url,
				title: track.title || '',
				description: track.description
					? track.slug
						? `${track.description} via @${track.slug}`
						: track.description
					: track.slug
						? `via @${track.slug}`
						: ''
			}
		} else {
			trackData = {url: data?.url || '', title: '', description: ''}
		}
		showModal = true
	}

	// Watch appState to open modal from anywhere
	$effect(() => {
		if (appState.modal_track_add) {
			open(appState.modal_track_add)
			appState.modal_track_add = null
		}
	})

	/** @param {KeyboardEvent} event */
	function handleKeyDown(event) {
		const target = /** @type {HTMLElement | null} */ (event.target)
		if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return
		if (event.key === 'c' && !event.metaKey && !event.ctrlKey) {
			open()
		}
	}

	/** @param {{data: {url: string, title: string} | null, error: Error | null}} event */
	function handleSubmit(event) {
		const {data, error} = event
		if (error || !data) return

		recentTracks.unshift(data)
		if (recentTracks.length > 3) recentTracks.pop()

		trackData = {url: '', title: '', description: ''}
		showModal = false

		document.dispatchEvent(
			new CustomEvent('r5:trackAdded', {
				detail: {track: data, channelId: channel?.id}
			})
		)
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<button class="btn" onclick={() => open()} {@attach tooltip({content: m.track_add_title()})}>
	<Icon icon="add" size={20}></Icon>
</button>

<Modal bind:showModal>
	{#snippet header()}
		<h2>{m.track_add_title()}</h2>
	{/snippet}

	{#if channel}
		<TrackForm
			mode="create"
			{channel}
			url={trackData.url}
			title={trackData.title}
			description={trackData.description}
			onsubmit={handleSubmit}
		/>
	{/if}

	{#if recentTracks.length > 0}
		<div class="recent-tracks">
			<h3>{m.track_recently_saved()}</h3>
			{#each recentTracks as track, i (i)}
				<div>{track.title || track.url}</div>
			{/each}
		</div>
	{/if}
</Modal>
