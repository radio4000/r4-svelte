<script lang="ts">
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import Dialog from '$lib/components/dialog.svelte'
	import TrackForm from '$lib/components/track-form.svelte'
	import TrackCard from '$lib/components/track-card.svelte'
	import {tracksCollection} from '$lib/collections/tracks'
	import {tooltip} from './tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'
	import type {Track} from '$lib/types'

	let showModal = $state(false)
	let recentTracks = $state<Track[]>([])
	let trackData = $state({url: '', title: '', description: '', discogs_url: ''})

	const channel = $derived(appState.channel)
	const isSignedIn = $derived(!!appState.user)

	/** @param {{track?: import('$lib/types').Track, url?: string}} [data] */
	function open(data = {}) {
		if (!isSignedIn) {
			goto(resolve('/auth'))
			return
		}
		if (!channel) {
			goto(resolve('/create-channel'))
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
						: '',
				discogs_url: track.discogs_url || ''
			}
		} else {
			trackData = {url: data?.url || '', title: '', description: '', discogs_url: ''}
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
			event.preventDefault()
			open()
		}
	}

	/** @param {{data: {url: string, title: string} | null, error: Error | null}} event */
	function handleSubmit(event) {
		const {data, error} = event
		if (error || !data) return

		const track = data.id ? tracksCollection.get(data.id) : null
		if (track) {
			recentTracks.unshift(track)
			if (recentTracks.length > 3) recentTracks.pop()
		}

		trackData = {url: '', title: '', description: '', discogs_url: ''}
		showModal = false

		document.dispatchEvent(
			new CustomEvent('r5:trackAdded', {
				detail: {track: data, channelId: channel?.id}
			})
		)
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<button
	class="btn"
	class:active={showModal}
	onclick={() => open()}
	aria-label={m.track_add_title()}
	{@attach tooltip({content: m.track_add_title()})}
>
	<Icon icon="add"></Icon>
</button>

<Dialog bind:showModal>
	{#snippet header()}
		<h2><a href={resolve('/add')}>{m.track_add_title()}</a></h2>
	{/snippet}

	{#if channel}
		<TrackForm
			mode="create"
			{channel}
			url={trackData.url}
			title={trackData.title}
			description={trackData.description}
			discogs_url={trackData.discogs_url}
			onsubmit={handleSubmit}
		/>
	{/if}

	{#if recentTracks.length > 0}
		<div class="recent-tracks">
			<h3>{m.track_recently_saved()}</h3>
			{#each recentTracks as track (track.id)}
				<TrackCard {track} canEdit={false} showImage={false} />
			{/each}
		</div>
	{/if}
</Dialog>

<style>
	.recent-tracks {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding-block-start: 1rem;
		border-block-start: 1px solid var(--color-interface-border);
	}

	.recent-tracks h3 {
		margin: 0 0 0.25rem;
		font-size: var(--font-3);
		color: var(--color-text-2);
	}
</style>
