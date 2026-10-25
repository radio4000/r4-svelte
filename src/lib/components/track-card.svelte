<script lang="ts">
	import {tick, type Snippet} from 'svelte'
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {
		playTrack,
		playNext,
		addToPlaylist,
		playTrackInNewDeck,
		togglePlayPause
	} from '#lib/api.js'
	import {deleteTrack} from '#lib/collections/tracks.js'
	import {channelsCollection} from '#lib/collections/channels.js'
	import {appState} from '#lib/app-state.svelte.js'
	import {trackAddSearchParams} from '#lib/track-add.js'
	import type {Track, Channel} from '#lib/types.js'
	import Icon from './icon.svelte'
	import PopoverMenu from './popover-menu.svelte'
	import Dialog from './dialog.svelte'
	import LinkEntities from './link-entities.svelte'
	import {tooltip} from './tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'
	import {isDbId, trackImageUrl} from '#lib/utils.js'

	interface Props {
		track: Track
		index?: number
		deckId?: number
		/** Prebuilt trackId → deck info, hoisted out of the card to avoid iterating
		 * appState.decks per row. Optional: cards without it fall back to per-card lookup. */
		deckLookup?: {get(trackId: string): {deckId: number; isPlaying: boolean} | undefined}
		selected?: boolean
		onPlay?: (trackId: string) => void
		showImage?: boolean
		showSlug?: boolean
		canEdit?: boolean
		showMenu?: boolean
		onTagClick?: (tag: string) => void
		onMentionClick?: (slug: string) => void
		/** Tags currently active in the page's own filter — highlights matching
		 * #tags inside the description instead of leaving that to Tag's URL
		 * fallback (which only understands the channel tracks page's ?tags=). */
		selectedTags?: string[]
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
		deckLookup,
		selected = false,
		onPlay,
		showImage = true,
		showSlug = false,
		canEdit = false,
		showMenu = true,
		onTagClick,
		onMentionClick,
		selectedTags,
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
	// When a deckLookup is provided (tracklist rows), it already encodes the same
	// semantics the per-card branches below compute — see tracklist.svelte's builder.
	const deckInfo = $derived(deckLookup?.get(track?.id))
	const active = $derived.by(() => {
		if (deckLookup) return Boolean(deckInfo)
		if (deckId != null) {
			const deck = appState.decks[deckId]
			return deck?.playlist_track === track?.id
		}
		return Object.values(appState.decks).some((d) => d.playlist_track === track?.id)
	})
	const matchedDeckId = $derived.by(() => {
		if (deckLookup) return deckInfo?.deckId ?? deckId ?? appState.active_deck_id
		if (deckId != null) return deckId
		for (const [id, deck] of Object.entries(appState.decks)) {
			if (deck?.playlist_track === track?.id) return Number(id)
		}
		return appState.active_deck_id
	})
	const isTrackPlaying = $derived.by(() => {
		if (deckLookup) return deckInfo?.isPlaying ?? false
		const targetDeck = appState.decks[matchedDeckId]
		return Boolean(targetDeck?.playlist_track === track?.id && targetDeck?.is_playing)
	})
	const ytid = $derived(!showImage || !appState.show_track_artwork ? null : track.media_id)
	// default, mqdefault, hqdefault, sddefault, maxresdefault
	const imageSrc = $derived(ytid ? trackImageUrl(ytid) : null)

	const dblclick = (event: MouseEvent) => {
		if (disableDoubleClickPlay) return
		event.preventDefault()
		const target = event.target as HTMLElement
		// Let the meta links (discogs) and hashtag/mention links navigate normally
		if (target.closest('.meta')) return
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
			const query = trackAddSearchParams(track).toString()
			const addPath = resolve('/add') + (query ? `?${query}` : '')
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
	let menu = $state<{close: () => void; open: () => Promise<void>}>()
	// A list renders thousands of cards and few menus get opened, so each card starts
	// with a lookalike trigger and mounts the real menu on first press.
	let menuMounted = $state(false)
	let articleEl = $state<HTMLElement>()

	async function mountMenu() {
		menuMounted = true
		await tick()
		await menu?.open()
		// The pressed placeholder is gone; keep focus on the trigger that replaced it
		articleEl?.querySelector<HTMLElement>('.trackcard-contextBtn')?.focus({preventScroll: true})
	}

	function handleArtworkClick(event: MouseEvent) {
		event.preventDefault()
		event.stopPropagation()
		if (
			active &&
			matchedDeckId != null &&
			appState.decks[matchedDeckId]?.playlist_track === track.id
		) {
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

<article class={{'track-card': true, active, selected: selected && !active}} bind:this={articleEl}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="card"
		ondblclick={dblclick}
		onmousedown={(e) => {
			if (e.detail >= 2) e.preventDefault()
		}}
	>
		{#if ytid && showImage && appState.show_track_artwork}
			{#if active}
				<!-- The active track's artwork is a static image — no play/pause toggle
				     hidden behind an unlabeled tap target for the track already playing. -->
				<img
					src={imageSrc}
					alt={track.title}
					class="artwork"
					loading={(index ?? 0) > 20 ? 'lazy' : undefined}
				/>
			{:else}
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
				</button>
			{/if}
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
					<LinkEntities
						slug={track.slug}
						filterMentions
						text={track.description}
						{onTagClick}
						{onMentionClick}
						{selectedTags}
						deckId={matchedDeckId}
					/>
				</p>
			{/if}
		</div>
		{#if (track.slug && track.discogs_url && !appState.embed_mode) || showSlug}
			<div class="meta">
				{#if track.slug && track.discogs_url && !appState.embed_mode}
					<a href="{permalink}/discogs" class="btn ghost discogs" title={m.track_meta_discogs()}
						><Icon icon="radio-on" size={14} /></a
					>
				{/if}
				{#if showSlug}<small>@{track.slug}</small>{/if}
			</div>
		{/if}
	</div>
	{#if showMenu && !menuMounted}
		<!-- Stands in for the menu until first tap; same dots and label, with a margin for .popover-menu's padding -->
		<button
			type="button"
			class="ghost trackcard-contextBtn menu-dots menu-placeholder"
			aria-label={m.common_more()}
			onclick={mountMenu}
		></button>
	{:else if showMenu}
		<PopoverMenu
			bind:this={menu}
			btnClass="ghost trackcard-contextBtn menu-dots"
			label={m.common_more()}
			align={menuAlign}
			valign={menuValign ?? 'top'}
		>
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
					}}><Icon icon="play-fill" />{m.common_play()}</button
				>
				{#if !appState.embed_mode}
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.track_play_next()})}
						onclick={() => {
							playNext(deckId ?? appState.active_deck_id, [track.id])
							menu?.close()
						}}><Icon icon="next-fill" />{m.track_play_next()}</button
					>
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.track_add_to_queue()})}
						onclick={() => {
							addToPlaylist(deckId ?? appState.active_deck_id, [track.id])
							menu?.close()
						}}><Icon icon="unordered-list" />{m.track_add_to_queue()}</button
					>
				{/if}
				<button
					type="button"
					role="menuitem"
					{@attach tooltip({content: m.track_card_play_in_deck()})}
					onclick={async () => {
						await playTrackInNewDeck(track.id, track.slug ?? undefined)
						menu?.close()
					}}><Icon icon="sidebar-fill-right" />{m.track_card_play_in_deck()}</button
				>
				{#if !appState.embed_mode}
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.track_add_to_radio()})}
						onclick={addToRadio}><Icon icon="add" />{m.track_add_to_radio()}</button
					>
				{/if}
				{#if isRealTrack}
					<button
						type="button"
						role="menuitem"
						{@attach tooltip({content: m.share_native()})}
						onclick={shareTrack}><Icon icon="share" />{m.share_native()}</button
					>
				{/if}
				{#if onLocate}
					<button type="button" role="menuitem" onclick={onLocate}
						><Icon icon="arrow-down" />{m.track_card_locate_in_list()}</button
					>
				{/if}
				{#if isRealTrack && !appState.embed_mode}
					<a href={permalink} role="menuitem"><Icon icon="circle-info" />{m.track_go_to()}</a>
				{:else if track.url && !appState.embed_mode}
					<a href={track.url} target="_blank" rel="noopener noreferrer nofollow ugc" role="menuitem"
						><Icon icon="circle-info" />{m.track_card_open_video()}</a
					>
				{/if}
				{#if canEdit}
					<button type="button" role="menuitem" onclick={editTrack}
						><Icon icon="edit" />{m.common_edit()}</button
					>
					<button
						type="button"
						class="menu-delete"
						role="menuitem"
						onclick={() => {
							menu?.close()
							showDeleteDialog = true
						}}><Icon icon="delete" />{m.common_delete()}</button
					>
				{/if}
			</menu>
		</PopoverMenu>
	{/if}
	{#if showDeleteDialog}
		<Dialog bind:showModal={showDeleteDialog}>
			{#snippet header()}
				<h2>{m.common_delete()}</h2>
			{/snippet}
			<p>{m.track_delete_confirm({title: track.title})}</p>
			<article class="delete-track-preview">
				<div class="card">
					{#if ytid && showImage && appState.show_track_artwork}
						<img
							src={imageSrc}
							alt={track.title}
							class="artwork"
							loading={(index ?? 0) > 20 ? 'lazy' : undefined}
						/>
					{/if}
					<div class="text">
						<h3 class="title">{track.title}</h3>
						{#if track.description}
							<p class="description">
								<LinkEntities
									slug={track.slug}
									filterMentions
									text={track.description}
									deckId={matchedDeckId}
								/>
							</p>
						{/if}
					</div>
				</div>
			</article>
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
		/* double-tap plays the track, so it mustn't also zoom the page */
		touch-action: manipulation;
		display: flex;
		flex-flow: row nowrap;
		gap: 0 0.5rem;
		padding: 0.5rem 0 0.5rem 0.5rem;
		line-height: 1.2;
		min-height: 53px; /* = same height with/without description */
		min-width: 0;
		color: inherit;
		cursor: var(--interactive-cursor, pointer);
		background: none;
		border: 0;
	}

	.artwork {
		aspect-ratio: 1/1;
		width: var(--track-artwork-size);
		width: 2.5rem;
		object-fit: cover;
		object-position: center;
		align-self: center;
		border-radius: var(--media-radius);
		flex-shrink: 0;
	}

	.artwork-trigger {
		padding: 0;
		border: 0;
		background: transparent;
		box-shadow: none;
		min-width: 0;
		min-height: 0;
		border-radius: var(--media-radius);
		overflow: hidden;
		flex-shrink: 0;
	}

	.artwork-trigger:focus,
	.artwork-trigger:focus-visible,
	.artwork-trigger:active {
		background: transparent;
		box-shadow: none;
		border-color: transparent;
		outline: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.artwork-trigger:hover {
			background: transparent;
			box-shadow: none;
			border-color: transparent;
			outline: none;
		}
	}

	.text {
		display: flex;
		flex-flow: column;
		justify-content: center;
		min-width: 0;
		gap: 0;
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
	}

	/* Same restraint as the active site menu item: flatten the row itself —
	   no border, no fill — and let the accent title be the only cue. */
	.active {
		background: transparent;
		border-color: transparent;
	}

	.active .title {
		color: var(--accent-9);
	}

	.active .title :global(a) {
		color: inherit;
	}

	/* Keyboard-current row (roving tabindex) — same weight as :hover/.active,
	   distinguished from them by the accent border instead of a gray one. */
	.selected {
		background: var(--gray-3);
		border-color: var(--accent-7);
		--tag-bg: var(--gray-4);
		--tag-bg-hover: var(--gray-5);
		--tag-bg-active: var(--gray-6);
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

		@media (hover: hover) and (pointer: fine) {
			&:hover {
				scrollbar-color: var(--gray-1) transparent;
			}
		}

		&:not(:hover)::-webkit-scrollbar-thumb {
			background: transparent;
		}
	}

	.meta {
		margin-left: auto;
		display: flex;
		flex-flow: column;
		place-items: flex-end;
		place-content: center;
		padding-top: 0.1rem;
		gap: var(--space-1);
	}

	@container (width < 80ch) {
		.meta small {
			display: none;
		}
	}

	article {
		display: flex;
		align-items: center;
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		transition:
			background 0.15s,
			border-color 0.15s;

		/* The row now paints its own opaque background, so the list's own
		   :hover background (layout.css) no longer shows through it. */
		@media (hover: hover) and (pointer: fine) {
			:global(.list > li:hover) &,
			:global(.list > div:hover) & {
				background: var(--gray-3);
				border-color: var(--color-control-border-hover);
			}
		}

		:global(.popover-menu) {
			position: relative;
			padding: 0.2em;
		}
	}

	.menu-placeholder {
		margin: 0.2em;
	}

	/* The ⋯ icon in CSS: one element per row, and the real trigger lives in PopoverMenu */
	article :global(.menu-dots) {
		&::before {
			content: '';
			width: 18px;
			height: 18px;
			background: currentColor;
			mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M18.006 11.994L18.006 12.006M12.006 11.994L12.006 12.006M6.006 11.994L6.006 12.006' stroke='black' stroke-width='4' stroke-linecap='round'/%3E%3C/svg%3E");
		}
	}

	.discogs {
		display: flex;
		align-items: center;
	}

	.delete-track-preview {
		margin: 0.5rem 0;
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		background: var(--color-interface-elevated);
	}

	.delete-track-preview .card {
		cursor: default;
	}

	.delete-track-preview :global(a) {
		pointer-events: none;
	}

	.menu-delete {
		color: var(--color-red);
	}
</style>
