<script lang="ts">
	import type {Snippet} from 'svelte'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {playTrack, playNext, playTrackInNewDeck} from '$lib/api'
	import {deleteTrack} from '$lib/collections/tracks'
	import {channelsCollection} from '$lib/collections/channels'
	import {appState} from '$lib/app-state.svelte'
	import type {Track, Channel} from '$lib/types'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
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
	const ytid = $derived(!showImage || appState.hide_track_artwork ? null : track.media_id)
	// default, mqdefault, hqdefault, sddefault, maxresdefault
	const imageSrc = $derived(ytid ? trackImageUrl(ytid) : null)

	const dblclick = (event: MouseEvent) => {
		event.preventDefault()
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
		if (!appState.user) {
			const addPath = resolve('/add') + (track.url ? `?url=${encodeURIComponent(track.url)}` : '')
			goto(resolve('/auth') + `?redirect=${encodeURIComponent(addPath)}`)
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
	<div
		class="card"
		ondblclick={dblclick}
		onmousedown={(e) => {
			if (e.detail >= 2) e.preventDefault()
		}}
	>
		{#if ytid && showImage && !appState.hide_track_artwork}<img
				src={imageSrc}
				alt={track.title}
				class="artwork"
				loading={(index ?? 0) > 20 ? 'lazy' : undefined}
			/>{/if}
		<div class="text">
			<h3 class="title" class:locatable={Boolean(onLocate)} onclick={onLocate}>{track.title}</h3>
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
		onclose={() => (showDeleteConfirm = false)}
		align={menuAlign}
		valign={menuValign}
	>
		{#snippet trigger()}
			<Icon icon="options-horizontal" />
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
						if (onPlay) {
							onPlay(track.id)
						} else {
							playTrack(deckId ?? appState.active_deck_id, track.id, null, 'user_click_track')
						}
						menu?.close()
					}}><Icon icon="play-fill" /></button
				>
				{#if !appState.embed_mode}
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.track_play_next()})}
						onclick={() => {
							playNext(deckId ?? appState.active_deck_id, track.id)
							menu?.close()
						}}><Icon icon="next-fill" /></button
					>
				{/if}
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.track_card_play_in_deck()})}
					onclick={async () => {
						await playTrackInNewDeck(track.id, track.slug ?? undefined)
						menu?.close()
					}}><Icon icon="sidebar-fill-right" /></button
				>
				{#if !appState.embed_mode}
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.track_add_to_radio()})}
						onclick={addToRadio}><Icon icon="add" /></button
					>
				{/if}
				{#if isRealTrack}
					<button type="button" role="menuitem" {@attach tooltip({content: m.share_native()})} onclick={shareTrack}
						><Icon icon="share" /></button
					>
				{/if}
			</menu>
			<menu class="nav-vertical">
				{#if onLocate}
					<button type="button" role="menuitem" onclick={onLocate}
						><Icon icon="arrow-down" size={14} />{m.track_card_locate_in_list()}</button
					>
				{/if}
				{#if isRealTrack && !appState.embed_mode}
					<a class="btn" href={permalink} role="menuitem"><Icon icon="circle-info" size={14} />{m.track_go_to()}</a>
				{:else if track.url && !appState.embed_mode}
					<a class="btn" href={track.url} target="_blank" rel="noopener noreferrer" role="menuitem"
						><Icon icon="circle-info" size={14} />{m.track_card_open_video()}</a
					>
				{/if}
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
		width: var(--track-artwork-size);
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
		font-weight: 400;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-radius: var(--border-radius);
		transition:
			background 0.15s,
			color 0.15s;
		&.locatable {
			cursor: pointer;
		}
		:global(a) {
			text-decoration: none;
			color: inherit;
		}
		.active & {
			/*
			background: var(--accent-9);
			color: var(--gray-1);
			 */
			padding-inline: var(--space-1);
			width: fit-content;
			max-width: 100%;
		}
	}

	.active {
		/* background: var(--accent-3); */
		outline: 1px solid var(--gray-5);
		outline-offset: -1px;
		border-radius: var(--border-radius);
		--tag-bg: var(--accent-5);
		--tag-bg-hover: var(--accent-7);
		--tag-bg-active: var(--accent-8);
		--tag-color: var(--accent-12);
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
			color: initial;
		}
	}
</style>
