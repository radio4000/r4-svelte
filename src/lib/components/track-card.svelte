<script lang="ts">
	import type {Snippet} from 'svelte'
	import {playTrack, playNext, playTrackInNewDeck} from '$lib/api'
	import {deleteTrack, channelsCollection} from '$lib/tanstack/collections'
	import {appState} from '$lib/app-state.svelte'
	import type {Track, Channel} from '$lib/types'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import LinkEntities from './link-entities.svelte'
	import {tooltip} from './tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	interface Props {
		track: Track
		index?: number
		deckId?: number
		selected?: boolean
		onPlay?: (trackId: string) => void
		showImage?: boolean
		showSlug?: boolean
		canEdit?: boolean
		onTagClick?: (tag: string) => void
		children?: Snippet<[Track]>
		description?: Snippet
	}

	let {
		track,
		index,
		deckId,
		selected = false,
		onPlay,
		showImage = true,
		showSlug = false,
		canEdit = false,
		onTagClick,
		children,
		description
	}: Props = $props()

	const permalink = $derived(`/${track?.slug}/tracks/${track?.id}`)
	const active = $derived.by(() => {
		if (deckId != null) {
			const deck = appState.decks[deckId]
			return deck?.playlist_track === track?.id
		}
		return Object.values(appState.decks).some((d) => d.playlist_track === track?.id)
	})
	const ytid = $derived(!showImage || appState.hide_track_artwork ? null : track.media_id)
	// default, mqdefault, hqdefault, sddefault, maxresdefault
	const imageSrc = $derived(ytid ? `https://i.ytimg.com/vi/${ytid}/mqdefault.jpg` : null)

	const dblclick = (event: MouseEvent) => {
		const target = event.target as HTMLElement
		// Let time element and hashtag/mention links navigate normally
		if (target.closest('time')) return
		if (
			(target instanceof HTMLAnchorElement && target !== event.currentTarget) ||
			target.closest('a[href*="/search"]') ||
			target.closest('button.tag-link')
		)
			return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
		if (onPlay) {
			onPlay(track.id)
			return
		}
		playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
	}

	const addToRadio = () => {
		appState.modal_track_add = {track}
	}

	const editTrack = () => {
		appState.modal_track_edit = {track}
	}

	const shareTrack = () => {
		const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug) as Channel | undefined
		if (channel) appState.modal_share = {track, channel}
	}

	let showDeleteConfirm = $state(false)
	let menu = $state<{close: () => void}>()

	async function handleDelete() {
		if (!track.slug) return
		const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
		if (!channel) return
		await deleteTrack({id: channel.id, slug: channel.slug}, track.id)
		menu?.close()
	}
</script>

<article class:active class:selected={selected && !active}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="card" ondblclick={dblclick}>
		{#if ytid && showImage && !appState.hide_track_artwork}<img
				src={imageSrc}
				alt={track.title}
				class="artwork"
				loading={(index ?? 0) > 20 ? 'lazy' : undefined}
			/>{/if}
		<div class="text">
			<h3 class="title">{track.title}</h3>
			{#if description}
				<p class="description">{@render description()}</p>
			{:else if track.description}
				<p class="description">
					<LinkEntities slug={track.slug} text={track.description} {onTagClick} />
				</p>
			{/if}
		</div>
		<time>
			<span class="mobile">&rarr;</span>
			{#if track.discogs_url}
				<small class="discogs">{m.track_meta_discogs()}</small>
			{/if}
			{#if showSlug}<small>@{track.slug}</small>{/if}
		</time>
	</div>
	<PopoverMenu bind:this={menu} btnClass="ghost" onclose={() => (showDeleteConfirm = false)}>
		{#snippet trigger()}
			<Icon icon="options-horizontal" size={16} />
		{/snippet}
		{#if showDeleteConfirm}
			<p>{m.track_delete_confirm({title: track.title})}</p>
			<button type="button" class="danger" role="menuitem" data-no-close onclick={handleDelete}
				>{m.common_confirm()}</button
			>
			<button type="button" role="menuitem" onclick={() => menu?.close()}>{m.common_cancel()}</button>
		{:else}
			<menu>
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.common_play()})}
					onclick={() => {
						playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
						menu?.close()
					}}><Icon icon="play-fill" size={16} /></button
				>
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.track_play_next()})}
					onclick={() => {
						playNext(deckId ?? appState.active_deck_id, track.id)
						menu?.close()
					}}><Icon icon="next-fill" size={16} /></button
				>
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: 'Play in new deck'})}
					onclick={async () => {
						await playTrackInNewDeck(track.id, track.slug ?? undefined)
						menu?.close()
					}}><Icon icon="sidebar-fill-right" size={16} /></button
				>
				<button type="button" role="menuitem" {@attach tooltip({content: m.track_add_to_radio()})} onclick={addToRadio}
					><Icon icon="add" size={16} /></button
				>
				<button type="button" role="menuitem" {@attach tooltip({content: m.share_native()})} onclick={shareTrack}
					><Icon icon="share" size={16} /></button
				>
			</menu>
			<menu class="nav-vertical">
				<a class="btn" href={permalink} role="menuitem"><Icon icon="circle-info" size={14} />{m.track_go_to()}</a>
				{#if canEdit}
					<button type="button" role="menuitem" onclick={editTrack}
						><Icon icon="settings" size={14} />{m.common_edit()}</button
					>
					<button type="button" class="danger" role="menuitem" data-no-close onclick={() => (showDeleteConfirm = true)}
						><Icon icon="delete" size={14} />{m.common_delete()}</button
					>
				{/if}
			</menu>
		{/if}
	</PopoverMenu>
	{@render children?.(track)}
</article>

<style>
	.card {
		flex: 1;
		display: flex;
		flex-flow: row nowrap;
		gap: 0 0.5rem;
		padding: 0.5rem 0 0.5rem 0.5rem;
		line-height: 1.2;
		min-height: 53px; /* = same height with/without description */
		min-width: 0;
		color: inherit;
	}

	.artwork {
		margin-bottom: auto;
		aspect-ratio: 1/1;
		width: 38px;
		object-fit: cover;
		object-position: center;
		align-self: center;
		border-radius: var(--media-radius);
	}

	.text {
		display: flex;
		flex-flow: column;
		justify-content: center;
		min-width: 0;
	}

	.title {
		font-size: var(--font-4);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		:global(a) {
			text-decoration: none;
			color: inherit;
		}
		.active & {
			background: var(--accent-9);
			color: var(--gray-1);
			padding-inline: var(--space-1);
			border-radius: 2px;
		}
	}

	.active,
	.selected {
		background: var(--accent-3);
	}

	h3 + p {
		line-height: 1.2;
		color: light-dark(var(--gray-11), var(--gray-10));
	}

	time {
		margin-left: auto;
		display: flex;
		flex-flow: column;
		place-items: flex-end;
		place-content: flex-start;
		padding-top: 0.1rem;
		gap: 0.15rem;
		/* because this is the actual link with some trickery */
		cursor: pointer;

		.mobile {
			display: none;
		}
	}

	@container (width < 80ch) {
		time small {
			display: none;
		}
		time .mobile {
			display: block;
		}
	}

	article {
		display: flex;
		align-items: flex-start;
		:global(.popover-menu) {
			padding: 0.2em;
		}
	}
</style>
