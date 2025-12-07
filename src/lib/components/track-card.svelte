<script lang="ts">
	import type {Snippet} from 'svelte'
	import {playTrack} from '$lib/api'
	import {deleteTrack, channelsCollection} from '../../routes/tanstack/collections'
	import {appState} from '$lib/app-state.svelte'
	import type {Track} from '$lib/types'
	import {extractYouTubeId} from '$lib/utils.ts'
	import Icon from './icon.svelte'
	import LinkEntities from './link-entities.svelte'
	import * as m from '$lib/paraglide/messages'

	interface Props {
		track: Track
		index?: number
		showImage?: boolean
		showSlug?: boolean
		canEdit?: boolean
		children?: Snippet<[Track]>
	}

	let {track, index, showImage = true, showSlug = false, canEdit = false, children}: Props = $props()

	const permalink = $derived(`/${track?.slug}/tracks/${track?.id}`)
	const active = $derived(track?.id === appState.playlist_track)
	// Only extract YouTube ID when we need it for images
	const ytid = $derived.by(() => {
		if (!showImage || appState.hide_track_artwork) return null
		return extractYouTubeId(track.url)
	})
	// default, mqdefault, hqdefault, sddefault, maxresdefault
	const imageSrc = $derived(ytid ? `https://i.ytimg.com/vi/${ytid}/mqdefault.jpg` : null)

	const click = (event: MouseEvent) => {
		const el = event.target as HTMLElement

		if (el.closest('time')) return

		// Let hashtag/mention links through
		if (el instanceof HTMLAnchorElement && el.href.includes('search=')) return

		event.preventDefault()
		//playTrack(track.id, '', 'user_click_track')
	}
	const doubleClick = () => playTrack(track.id, null, 'user_click_track')

	const addToRadio = (url: string) => {
		// Trigger global modal via custom event
		window.dispatchEvent(new CustomEvent('r5:openAddModal', {detail: {url}}))
	}

	const editTrack = () => {
		// Trigger global edit modal via custom event
		window.dispatchEvent(new CustomEvent('r5:openEditModal', {detail: {track}}))
	}

	let showDeleteConfirm = $state(false)

	async function handleDelete() {
		if (!track.slug) return
		const channel = [...channelsCollection.state.values()].find((c) => c.slug === track.slug)
		if (!channel) return
		await deleteTrack({id: channel.id, slug: channel.slug}, track.id)
		showDeleteConfirm = false
	}

	let menuElement: HTMLElement

	$effect(() => {
		if (!menuElement) return

		const handleToggle = (e: Event) => {
			const menu = e.target as HTMLElement
			if (menu.matches(':popover-open')) {
				const button = document.querySelector(`[popovertarget="${menu.id}"]`) as HTMLElement
				if (button) {
					const rect = button.getBoundingClientRect()
					menu.style.position = 'fixed'
					menu.style.top = `${rect.bottom - 10}px`
					menu.style.left = `${rect.right - 150}px`
				}
			}
		}

		menuElement.addEventListener('toggle', handleToggle)
		return () => menuElement?.removeEventListener('toggle', handleToggle)
	})
</script>

<article class:active>
	<a href={permalink} onclick={click} ondblclick={doubleClick} data-sveltekit-preload-data="tap">
		<span class="index"> {(index ?? 0) + 1}. </span>
		{#if ytid && showImage && !appState.hide_track_artwork}<img
				src={imageSrc}
				alt={track.title}
				class="artwork"
				loading={(index ?? 0) > 20 ? 'lazy' : undefined}
			/>{/if}
		<div class="text">
			<h3 class="title">{track.title}</h3>
			{#if track.description}
				<p class="description">
					<small>
						<LinkEntities slug={track.slug} text={track.description} />
					</small>
					{#if track.duration}<small>{m.track_duration_seconds({seconds: track.duration})}</small>{/if}
				</p>
			{/if}
		</div>
		<time>
			<span class="mobile">&rarr;</span>
			<!--<small>{formatDate(new Date(track.created_at))}</small>-->
			{#if showSlug}<small>@{track.slug}</small>{/if}
		</time>
	</a>
	<r4-actions>
		<button type="button" popovertarget="menu-{track.id}">
			<Icon icon="options-horizontal" size={16} />
		</button>
		<menu popover="auto" id="menu-{track.id}" bind:this={menuElement}>
			{#if showDeleteConfirm}
				<div class="delete-confirm">
					<p>{m.track_delete_confirm({title: track.title})}</p>
					<button type="button" class="danger" role="menuitem" onclick={handleDelete}>{m.common_confirm()}</button>
					<button type="button" role="menuitem" onclick={() => (showDeleteConfirm = false)}>{m.common_cancel()}</button>
				</div>
			{:else}
				<a class="btn" href={permalink} role="menuitem">{m.common_details()}</a>
				{#if canEdit}<button type="button" role="menuitem" onclick={editTrack}>{m.common_edit()}</button>{/if}
				<button type="button" role="menuitem" onclick={() => addToRadio(track.url)}>{m.common_add()}</button>
				{#if canEdit}<button type="button" class="danger" role="menuitem" onclick={() => (showDeleteConfirm = true)}
						>{m.common_delete()}</button
					>{/if}
			{/if}
		</menu>
	</r4-actions>
	{@render children?.(track)}
</article>

<style>
	a {
		display: flex;
		flex-flow: row nowrap;
		gap: 0 0.5rem;
		padding: 0.5rem 2rem 0.5rem 0.5rem;
		line-height: 1.2;
		text-decoration: none;
		cursor: default;

		&:focus {
			outline: 2px solid var(--accent-9);
			outline-offset: -2px;
		}
	}

	a > span:first-child {
		width: 1.5rem;
		margin: auto 0;
		flex-shrink: 0;
		color: var(--gray-8);
		font-size: var(--font-1);
		text-align: right;
	}

	.artwork {
		width: 2rem;
		height: 2rem;
		object-fit: cover;
		object-position: center;
		align-self: center;
		border-radius: var(--media-radius);
	}

	.text {
		display: flex;
		flex-flow: column;
		justify-content: center;
	}

	.title {
		.active & {
			background: var(--accent-9);
			color: var(--gray-1);
		}
	}

	p {
		margin: 0;
		/* tags */
		:global(a) {
			color: var(--gray-10);
		}
	}

	time {
		margin-left: auto;
		display: flex;
		flex-flow: column;
		place-items: flex-end;
		place-content: center;
		/* because this is the actual link with some trickery */
		cursor: pointer;

		.mobile {
			display: none;
		}
	}

	@container (width < 80ch) {
		.index,
		time small {
			display: none;
		}
		time .mobile {
			display: block;
		}
	}

	article {
		position: relative;
		/* container-type: inline-size; */
	}

	r4-actions {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;

		> button:first-child {
			height: 100%;
			box-shadow: none;
			border: none;
		}

		menu {
			display: none;
			flex-direction: column;
			align-items: stretch;
			list-style: none;
			background-color: var(--gray-2);
			border: 1px solid var(--gray-7);
			border-radius: var(--border-radius);
			box-shadow: var(--shadow-modal);
			width: 140px;
			/*padding: 3px;*/
			gap: 0;
			margin: 0;

			&:popover-open {
				display: flex;
			}

			> * {
				width: 100%;
				text-align: left;
				justify-content: flex-start;
			}
		}
	}
</style>
