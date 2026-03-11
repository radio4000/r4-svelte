<script>
	import InlineEditCell from './inline-edit-cell.svelte'
	import {resolve} from '$app/paths'
	import {formatDuration} from '$lib/dates.js'
	import * as m from '$lib/paraglide/messages'

	const EDITABLE_FIELDS = ['url', 'title', 'description', 'discogs_url']

	let {
		track,
		slug,
		isSelected,
		onSelect,
		onEdit,
		canEdit,
		focusedField = null,
		onFocusChange,
		hiddenColumns = [],
		gridTemplate
	} = $props()

	function handleTab(field, direction) {
		const currentIndex = EDITABLE_FIELDS.indexOf(field)
		const nextIndex = currentIndex + direction
		if (nextIndex >= 0 && nextIndex < EDITABLE_FIELDS.length) {
			onFocusChange?.(track.id, EDITABLE_FIELDS[nextIndex])
		} else {
			// Move to next/prev row
			onFocusChange?.(null, direction > 0 ? 'next-row' : 'prev-row')
		}
	}
</script>

<div class="track-row" class:selected={isSelected} style:grid-template-columns={gridTemplate}>
	<div class="col-checkbox">
		<input
			type="checkbox"
			checked={isSelected}
			onclick={(e) => {
				// Preserve shift for range selection, otherwise toggle
				if (e.shiftKey) {
					onSelect(e)
				} else {
					onSelect({...e, ctrlKey: true, metaKey: true})
				}
			}}
		/>
	</div>

	<div class="col-link">
		<a
			href={resolve('/[slug]/tracks/[tid]', {slug, tid: track.id})}
			target="_blank"
			rel="noopener noreferrer"
			title={m.batch_edit_track_link_title()}
		>
			↗
		</a>
	</div>

	{#if !hiddenColumns.includes('url')}<div class="col-url">
			<InlineEditCell
				{track}
				field="url"
				{onEdit}
				{canEdit}
				isFocused={focusedField === 'url'}
				onTab={(dir) => handleTab('url', dir)}
			/>
		</div>{/if}
	{#if !hiddenColumns.includes('title')}<div class="col-title">
			<InlineEditCell
				{track}
				field="title"
				{onEdit}
				{canEdit}
				isFocused={focusedField === 'title'}
				onTab={(dir) => handleTab('title', dir)}
			/>
		</div>{/if}
	{#if !hiddenColumns.includes('description')}<div class="col-description">
			<InlineEditCell
				{track}
				field="description"
				{onEdit}
				{canEdit}
				isFocused={focusedField === 'description'}
				onTab={(dir) => handleTab('description', dir)}
			/>
		</div>{/if}
	{#if !hiddenColumns.includes('tags')}<div class="col-tags">{track.tags || ''}</div>{/if}
	{#if !hiddenColumns.includes('mentions')}<div class="col-mentions">{track.mentions || ''}</div>{/if}
	{#if !hiddenColumns.includes('discogs')}<div class="col-discogs">
			<InlineEditCell
				{track}
				field="discogs_url"
				{onEdit}
				{canEdit}
				isFocused={focusedField === 'discogs_url'}
				onTab={(dir) => handleTab('discogs_url', dir)}
			/>
		</div>{/if}
	{#if !hiddenColumns.includes('duration')}<div class="col-duration">
			{#if track.duration}{formatDuration(track.duration)}{/if}
		</div>{/if}
	{#if !hiddenColumns.includes('meta')}<div class="col-meta">
			{#if track.youtube_data}<span class="meta-indicator yt" title="YouTube metadata">Y</span>{/if}
			{#if track.musicbrainz_data}<span class="meta-indicator mb" title="MusicBrainz metadata">M</span>{/if}
			{#if track.discogs_data}<span class="meta-indicator dc" title="Discogs metadata">D</span>{/if}
		</div>{/if}
	{#if !hiddenColumns.includes('error')}<div class="col-error" class:has-error={track.playback_error}>
			{#if track.playback_error}<span title={track.playback_error}>⚠ {track.playback_error}</span>{/if}
		</div>{/if}
	{#if !hiddenColumns.includes('created')}<div class="col-date">
			{new Date(track.created_at).toLocaleDateString()}
		</div>{/if}
	{#if !hiddenColumns.includes('updated')}<div class="col-date">
			{track.updated_at ? new Date(track.updated_at).toLocaleDateString() : ''}
		</div>{/if}
</div>

<style>
	.track-row {
		display: grid;
		gap: 0.5rem;
		min-height: 2.5rem;
		border-bottom: 1px solid var(--gray-7);
		font-size: var(--font-4);
	}

	.track-row:hover {
		background: light-dark(var(--gray-2), var(--gray-2));
	}

	.col-checkbox,
	.col-link {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.col-title,
	.col-tags,
	.col-mentions,
	.col-description,
	.col-url,
	.col-discogs,
	.col-error {
		display: flex;
		align-items: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.col-error.has-error {
		color: var(--red-9);
	}

	.col-meta,
	.col-duration,
	.col-date {
		display: flex;
		align-items: center;
	}
</style>
