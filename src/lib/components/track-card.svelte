<script lang="ts">
	import type {Snippet} from 'svelte'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {playTrack, addToPlaylist, playTrackInNewDeck, togglePlayPause} from '$lib/api'
	import {deleteTrack} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import type {Track, Channel} from '$lib/types'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import Dialog from './dialog.svelte'
	import LinkEntities from './link-entities.svelte'
	import {tooltip} from './tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'
	import {isDbId, trackImageUrl} from '$lib/utils'

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
		menuAlign?: 'left' | 'right' | 'end'
		menuValign?: 'top' | 'bottom'
		onLocate?: () => void
		disableDoubleClickPlay?: boolean
		linkTitleToTrack?: boolean
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
		menuAlign,
		menuValign,
		onLocate,
		disableDoubleClickPlay = false,
		linkTitleToTrack = false,
		children,
		description
	}: Props = $props()

	const permalink = $derived(`/${track?.slug}/tracks/${track?.id}`)
	const isRealTrack = $derived(isDbId(track?.id))
	const active = $derived.by(() => {
		if (deckId != null) {
			const deck = appState.decks[deckId]
			return deck?.playlist_track === track?.id
		}
		return Object.values(appState.decks).some((d) => d.playlist_track === track?.id)
	})
	const matchedDeckId = $derived.by(() => {
		if (deckId != null) return deckId
		for (const [id, deck] of Object.entries(appState.decks)) {
			if (deck?.playlist_track === track?.id) return Number(id)
		}
		return appState.active_deck_id
	})
	const isTrackPlaying = $derived.by(() => {
		const targetDeck = appState.decks[matchedDeckId]
		return Boolean(targetDeck?.playlist_track === track?.id && targetDeck?.is_playing)
	})
	const ytid = $derived(!showImage || appState.hide_track_artwork ? null : track.media_id)
	// default, mqdefault, hqdefault, sddefault, maxresdefault
	const imageSrc = $derived(ytid ? trackImageUrl(ytid) : null)

	const dblclick = (event: MouseEvent) => {
		if (disableDoubleClickPlay) return
		event.preventDefault()
		const target = event.target as HTMLElement
		// Let time element and hashtag/mention links navigate normally
		if (target.closest('time')) return
		if (
			target.closest('button') ||
			(target instanceof HTMLAnchorElement && target !== event.currentTarget) ||
			target.closest('a[href*="/search"]') ||
			target.closest('button.tag-link')
		)
			return
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return
		if (onPlay) {
			onPlay(track.id)
			return
		}
		playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
	}

	const addToRadio = () => {
		if (!appState.user) {
			const addPath = resolve('/add') + (track.url ? `?url=${encodeURIComponent(track.url)}` : '')
			const authPath = resolve('/auth') + `?redirect=${encodeURIComponent(addPath)}`
			goto(authPath)
			return
		}
		appState.modal_track_add = {track}
	}

	const editTrack = () => {
		appState.modal_track_edit = {track}
	}

	const shareTrack = () => {
		const channel = ([...channelsCollection.state.values()].find((ch) => ch.slug === track.slug) ??
			(track.slug ? ({slug: track.slug} as unknown as Channel) : undefined)) as Channel | undefined
		if (channel) appState.modal_share = {track, channel}
	}

	let showDeleteDialog = $state(false)
	let menu = $state<{close: () => void}>()

	function handleArtworkClick(event: MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		if (active && matchedDeckId != null && appState.decks[matchedDeckId]?.playlist_track === track.id) {
			togglePlayPause(matchedDeckId)
			return
		}
		if (onPlay) {
			onPlay(track.id)
			return
		}
		playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
	}

	async function handleDelete() {
		if (!track.slug) return
		const channel = [...channelsCollection.state.values()].find((ch) => ch.slug === track.slug)
		if (!channel) return
		await deleteTrack({id: channel.id, slug: channel.slug}, track.id)
		showDeleteDialog = false
		menu?.close()
	}
</script>

<article class={{active, selected: selected && !active}}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="card"
		ondblclick={dblclick}
		onmousedown={(e) => {
			if (e.detail >= 2) e.preventDefault()
		}}
	>
		{#if ytid && showImage && !appState.hide_track_artwork}
			<button
				type="button"
				class="artwork-trigger"
				title={isTrackPlaying ? m.common_pause() : m.common_play()}
				onclick={handleArtworkClick}
				ondblclick={(event) => event.stopPropagation()}
			>
				<img
					src={imageSrc}
					alt={track.title}
					class="artwork"
					loading={(index ?? 0) > 20 ? 'lazy' : undefined}
				/>
				<span class={['artwork-overlay', {visible: selected || active}]}>
					<Icon icon={isTrackPlaying ? 'pause' : 'play-fill'} size={16} />
				</span>
			</button>
		{/if}
		<div class="text">
			<h3 class={['title', {locatable: Boolean(onLocate && !linkTitleToTrack)}]} onclick={onLocate}>
				{#if linkTitleToTrack && isRealTrack && !appState.embed_mode}
					<a href={permalink}>{track.title}</a>
				{:else}
					{track.title}
				{/if}
			</h3>
			{#if description}
				<p class="description">{@render description()}</p>
			{:else if track.description}
				<p class="description">
					<LinkEntities slug={track.slug} text={track.description} {onTagClick} />
				</p>
			{/if}
		</div>
		<time>
			{#if isRealTrack}
				<span class="mobile">&rarr;</span>
			{:else if track.url && !appState.embed_mode}
				<a class="mobile" href={track.url} target="_blank" rel="noopener noreferrer">&rarr;</a>
			{/if}
			{#if track.slug && track.discogs_url && !appState.embed_mode}
				<a href="{permalink}/discogs" class="btn ghost discogs" title={m.track_meta_discogs()}
					><Icon icon="radio-on" size={14} /></a
				>
			{/if}
			{#if showSlug}<small>@{track.slug}</small>{/if}
		</time>
	</div>
	<PopoverMenu
		bind:this={menu}
		btnClass="ghost trackcard-contextBtn"
		align={menuAlign}
		valign={menuValign}
	>
		{#snippet trigger()}
			<Icon icon="options-horizontal" />
		{/snippet}
		<menu class="nav-vertical">
			<button
				type="button"
				role="menuitem"
				{@attach tooltip({content: m.common_play()})}
				onclick={() => {
					if (onPlay) {
						onPlay(track.id)
					} else {
						playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
					}
					menu?.close()
				}}><Icon icon="play-fill" size={14} />{m.common_play()}</button
			>
			{#if !appState.embed_mode}
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.track_play_next()})}
					onclick={() => {
						addToPlaylist(deckId ?? appState.active_deck_id, [track.id])
						menu?.close()
					}}><Icon icon="next-fill" size={14} />{m.track_play_next()}</button
				>
			{/if}
			<button
				type="button"
				role="menuitem"
				{@attach tooltip({content: m.track_card_play_in_deck()})}
				onclick={async () => {
					await playTrackInNewDeck(track.id, track.slug ?? undefined)
					menu?.close()
				}}><Icon icon="sidebar-fill-right" size={14} />{m.track_card_play_in_deck()}</button
			>
			{#if !appState.embed_mode}
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.track_add_to_radio()})}
					onclick={addToRadio}><Icon icon="add" size={14} />{m.track_add_to_radio()}</button
				>
			{/if}
			{#if isRealTrack}
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.share_native()})}
					onclick={shareTrack}><Icon icon="share" size={14} />{m.share_native()}</button
				>
			{/if}
			{#if onLocate}
				<button type="button" role="menuitem" onclick={onLocate}
					><Icon icon="arrow-down" size={14} />{m.track_card_locate_in_list()}</button
				>
			{/if}
			{#if isRealTrack && !appState.embed_mode}
				<a href={permalink} role="menuitem"
					><Icon icon="circle-info" size={14} />{m.track_go_to()}</a
				>
			{:else if track.url && !appState.embed_mode}
				<a href={track.url} target="_blank" rel="noopener noreferrer" role="menuitem"
					><Icon icon="circle-info" size={14} />{m.track_card_open_video()}</a
				>
			{/if}
			{#if canEdit}
				<button type="button" role="menuitem" onclick={editTrack}
					><Icon icon="settings" size={14} />{m.common_edit()}</button
				>
				<button
					type="button"
					class="menu-delete"
					role="menuitem"
					onclick={() => {
						menu?.close()
						showDeleteDialog = true
					}}><Icon icon="delete" size={14} />{m.common_delete()}</button
				>
			{/if}
		</menu>
	</PopoverMenu>
	{#if showDeleteDialog}
		<Dialog bind:showModal={showDeleteDialog}>
			{#snippet header()}
				<h2>{m.common_delete()}</h2>
			{/snippet}
			<p>{m.track_delete_confirm({title: track.title})}</p>
			{#snippet footer()}
				<menu class="row">
					<button type="button" class="danger" onclick={handleDelete}>{m.common_confirm()}</button>
					<button type="button" class="ghost" onclick={() => (showDeleteDialog = false)}
						>{m.common_cancel()}</button
					>
				</menu>
			{/snippet}
		</Dialog>
	{/if}
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
		cursor: var(--interactive-cursor, pointer);
	}

	.artwork {
		aspect-ratio: 1/1;
		width: var(--track-artwork-size);
		object-fit: cover;
		object-position: center;
		align-self: center;
		border-radius: var(--media-radius);
	}

	.artwork-trigger {
		position: relative;
		padding: 0;
		border: 0;
		background: transparent;
		border-radius: var(--media-radius);
		overflow: hidden;
		flex-shrink: 0;
	}

	.artwork-trigger:hover,
	.artwork-trigger:focus-visible,
	.artwork-trigger:active {
		background: transparent;
	}

	.artwork-overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: white;
		background: color-mix(in srgb, var(--gray-12) 42%, transparent);
		opacity: 0;
		transition: opacity 0.15s;
	}

	.artwork-overlay.visible,
	.artwork-trigger:hover .artwork-overlay,
	.artwork-trigger:focus-visible .artwork-overlay {
		opacity: 1;
	}

	.text {
		display: flex;
		flex-flow: column;
		justify-content: center;
		min-width: 0;
	}

	.title {
		font-size: var(--font-4);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-radius: var(--border-radius);
		transition:
			background 0.15s,
			color 0.15s;
		&.locatable {
			cursor: var(--interactive-cursor, pointer);
		}
		:global(a) {
			text-decoration: none;
			color: inherit;
			cursor: var(--interactive-cursor, pointer);
		}
		.active & {
			color: var(--accent-10);
		}
	}

	.active {
		background: transparent;
	}

	.selected {
		background: var(--gray-2);
		border-radius: var(--border-radius);
		outline: 1px solid var(--accent-7);
		outline-offset: -1px;
		--tag-bg: var(--accent-4);
		--tag-bg-hover: var(--accent-5);
		--tag-bg-active: var(--accent-6);
		--tag-color: var(--accent-11);
	}

	h3 + p {
		line-height: 1.2;
		color: light-dark(var(--gray-11), var(--gray-10));
		white-space: nowrap;
		/* to accomodate tag borders */
		padding: 2px 1px 2px;

		/* scroll */
		overflow-x: auto;
		scrollbar-width: thin;

		/* trick to only show scrollbar on hover */
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 150ms;

		&:hover {
			scrollbar-color: var(--gray-1) transparent;
		}

		&:not(:hover)::-webkit-scrollbar-thumb {
			background: transparent;
		}
	}

	time {
		margin-left: auto;
		display: flex;
		flex-flow: column;
		place-items: flex-end;
		place-content: center;
		padding-top: 0.1rem;
		gap: 0.15rem;
		/* because this is the actual link with some trickery */
		cursor: var(--interactive-cursor, pointer);

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
		align-items: center;
		:global(.popover-menu) {
			padding: 0.2em;
		}
	}

	.discogs {
		display: flex;
		align-items: center;
		color: var(--gray-10);
	}

	:global(.trackcard-contextBtn) {
		color: var(--gray-9);
		article:hover & {
			color: inherit;
		}
	}

	.menu-delete {
		color: var(--color-red);
	}
</style>
