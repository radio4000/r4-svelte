<script>
	import {
		batchUpdateTracksUniform,
		insertDurationFromMeta,
		resetTitlesFromVideo,
		undoTitleReset
	} from '$lib/collections/tracks'
	import {deleteTrackMeta} from '$lib/collections/track-meta'
	import {loadTitleUndo} from '$lib/title-reset'
	import {pullYouTube} from '$lib/metadata/youtube'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {getChannelTags} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	/** @type {{selectedIds?: string[], channel: import('$lib/types').Channel | null, allTags?: ReturnType<typeof getChannelTags>, tracks?: import('$lib/types').TrackWithMeta[] }} */
	let {selectedIds = [], channel, allTags = [], tracks = []} = $props()

	let showAppend = $state(false)
	let showRemoveTag = $state(false)
	let appendText = $state('')
	let fetchingMeta = $state(false)
	let fetchProgress = $state({current: 0, total: 0})
	let resettingTitles = $state(false)
	let titleProgress = $state({current: 0, total: 0})
	let titleError = $state('')
	let undoCount = $state(0)

	$effect(() => {
		if (channel) undoCount = loadTitleUndo(channel.slug).length
	})

	/** @type {import('$lib/types').TrackWithMeta[]} */
	let selectedTracks = $derived(
		selectedIds.map((id) => tracks.find((t) => t.id === id)).filter((t) => t !== undefined)
	)

	// Selected tracks missing YouTube metadata
	let selectedMissingMeta = $derived(
		selectedTracks.filter(
			(track) =>
				getTrackProvider(track) === 'youtube' && !track.youtube_data && !track.playback_error
		)
	)

	// Tracks that have metadata duration but no track duration
	let tracksWithMetaDuration = $derived(
		selectedTracks.filter((t) => !t.duration && t.youtube_data?.duration)
	)

	// Tracks that have a duration set
	let tracksWithDuration = $derived(selectedTracks.filter((t) => t.duration))

	// Tracks that have any metadata
	let tracksWithMeta = $derived(
		selectedTracks.filter((t) => t.youtube_data || t.musicbrainz_data || t.discogs_data)
	)

	let selectedYouTube = $derived(
		selectedTracks.filter((t) => getTrackProvider(t) === 'youtube' && t.media_id)
	)

	// Tags present in selected tracks
	let selectedTracksTags = $derived(getChannelTags(selectedTracks))

	function getTrackProvider(track) {
		return track.provider ?? null
	}

	function closeDialogs() {
		showAppend = false
		showRemoveTag = false
		appendText = ''
	}

	async function append(text) {
		if (!text || !channel) return

		for (const track of selectedTracks) {
			const desc = track.description || ''
			const newDesc = desc ? `${desc} ${text}` : text
			await batchUpdateTracksUniform(channel, [track.id], {description: newDesc})
		}
		closeDialogs()
	}

	async function removeTag(tag) {
		if (!tag || !channel) return
		const tagPattern = new RegExp(`\\s*#${tag.replace('#', '')}\\b`, 'g')

		for (const track of selectedTracks) {
			const desc = track.description || ''
			const newDesc = desc.replace(tagPattern, '').trim()
			if (newDesc !== desc) {
				await batchUpdateTracksUniform(channel, [track.id], {description: newDesc})
			}
		}
		closeDialogs()
	}

	async function removeDuration() {
		if (!channel || selectedIds.length === 0) return
		await batchUpdateTracksUniform(channel, selectedIds, {duration: null})
	}

	async function copyDurationFromMeta() {
		if (!channel || tracksWithMetaDuration.length === 0) return
		await insertDurationFromMeta(channel, selectedTracks)
	}

	function removeMeta() {
		const refs = tracksWithMeta
			.filter((track) => track.media_id)
			.map((track) => ({provider: getTrackProvider(track), media_id: track.media_id}))
		if (refs.length === 0) return
		deleteTrackMeta(refs)
	}

	/** @param {() => Promise<number>} run */
	async function runTitleJob(run) {
		if (resettingTitles || !channel) return
		resettingTitles = true
		titleError = ''
		titleProgress = {current: 0, total: 0}
		try {
			await run()
		} catch (err) {
			titleError = /** @type {Error} */ (err).message
		} finally {
			undoCount = loadTitleUndo(channel.slug).length
			resettingTitles = false
		}
	}

	const onTitleProgress = (current, total) => (titleProgress = {current, total})

	function resetTitles() {
		if (!channel || selectedYouTube.length === 0) return
		if (!confirm(m.batch_edit_reset_title_confirm({count: selectedYouTube.length}))) return
		runTitleJob(() => resetTitlesFromVideo(channel, selectedYouTube, onTitleProgress))
	}

	function undoTitles() {
		if (!channel) return
		runTitleJob(() => undoTitleReset(channel, onTitleProgress))
	}

	async function fetchMeta() {
		if (fetchingMeta || selectedMissingMeta.length === 0 || !channel) return
		fetchingMeta = true
		fetchProgress = {current: 0, total: 0}
		try {
			const youtubeRefs = selectedMissingMeta
				.map((track) => ({provider: getTrackProvider(track), mediaId: track.media_id ?? ''}))
				.filter((track) => track.provider === 'youtube' && track.mediaId !== '')
			await pullYouTube(youtubeRefs, {
				onProgress: ({current, total}) => {
					fetchProgress = {current, total}
				}
			})
			await insertDurationFromMeta(channel, selectedMissingMeta)
		} finally {
			fetchingMeta = false
			fetchProgress = {current: 0, total: 0}
		}
	}
</script>

<aside>
	{#if selectedIds.length > 0}
		<span class="count">Selected: {selectedIds.length}</span>

		{#if tracksWithMetaDuration.length > 0}
			<button
				onclick={copyDurationFromMeta}
				{@attach tooltip({content: m.batch_edit_action_copy_duration()})}
				>Copy duration ({tracksWithMetaDuration.length})</button
			>
		{/if}

		{#if tracksWithDuration.length > 0}
			<button
				onclick={removeDuration}
				{@attach tooltip({content: m.batch_edit_action_remove_duration()})}
				>Remove duration ({tracksWithDuration.length})</button
			>
		{/if}

		{#if selectedMissingMeta.length > 0}
			<button
				onclick={fetchMeta}
				disabled={fetchingMeta}
				{@attach tooltip({content: m.batch_edit_action_fetch_meta()})}
			>
				{fetchingMeta
					? `Fetching... (${fetchProgress.current}/${fetchProgress.total})`
					: `Fetch meta (${selectedMissingMeta.length})`}
			</button>
		{/if}

		{#if tracksWithMeta.length > 0}
			<button onclick={removeMeta} {@attach tooltip({content: m.batch_edit_action_remove_meta()})}
				>Remove meta ({tracksWithMeta.length})</button
			>
		{/if}

		{#if selectedYouTube.length > 0}
			<button
				onclick={resetTitles}
				disabled={resettingTitles}
				{@attach tooltip({content: m.batch_edit_action_reset_title()})}
			>
				{resettingTitles
					? `${m.batch_edit_reset_title_button({count: selectedYouTube.length})} (${titleProgress.current}/${titleProgress.total})`
					: m.batch_edit_reset_title_button({count: selectedYouTube.length})}
			</button>
		{/if}

		<hr />

		<button
			onclick={() => (showAppend = true)}
			disabled={selectedIds.length === 0}
			{@attach tooltip({content: m.batch_edit_action_append_description()})}
		>
			{m.batch_edit_append_button()}
		</button>
		<button
			onclick={() => (showRemoveTag = true)}
			disabled={selectedTracksTags.length === 0}
			{@attach tooltip({content: m.batch_edit_action_remove_tag()})}
			>{m.batch_edit_remove_tag_button()}</button
		>
	{:else}
		&nbsp;
	{/if}

	{#if undoCount > 0}
		<button
			onclick={undoTitles}
			disabled={resettingTitles}
			{@attach tooltip({content: m.batch_edit_action_undo_title_reset()})}
			>{m.batch_edit_undo_title_reset_button({count: undoCount})}</button
		>
	{/if}

	{#if titleError}
		<span role="alert">{m.common_error()}: {titleError}</span>
	{/if}
</aside>

{#if showAppend}
	<dialog open>
		<h3>{m.batch_edit_append_dialog_title({count: selectedIds.length})}</h3>
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault()
				append(appendText)
			}}
		>
			<fieldset>
				<label for="{uid}-append" class="visually-hidden">{m.batch_edit_append_label()}</label>
				<input
					id="{uid}-append"
					type="text"
					bind:value={appendText}
					placeholder={m.batch_edit_append_placeholder()}
					autofocus
				/>
			</fieldset>
			{#if allTags.length > 0}
				<menu>
					{#each allTags.slice(0, 10) as { value } (value)}
						<button
							type="button"
							onclick={() => (appendText = appendText ? `${appendText} #${value}` : `#${value}`)}
							>#{value}</button
						>
					{/each}
				</menu>
			{/if}
			<footer>
				<button type="button" onclick={closeDialogs}>{m.common_cancel()}</button>
				<button type="submit" disabled={!appendText.trim()}>{m.batch_edit_append_submit()}</button>
			</footer>
		</form>
	</dialog>
{/if}

{#if showRemoveTag}
	<dialog open>
		<h3>{m.batch_edit_remove_tag_dialog_title({count: selectedIds.length})}</h3>
		<menu>
			{#each selectedTracksTags as { value, count } (value)}
				<button onclick={() => removeTag(value)}>#{value} ({count})</button>
			{/each}
		</menu>
		<footer>
			<button onclick={closeDialogs}>{m.common_cancel()}</button>
		</footer>
	</dialog>
{/if}

<style>
	aside {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0.5rem;
		min-height: 2rem;
	}

	.count {
		font-weight: bold;
		margin-right: 0.5rem;
	}

	dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--gray-1);
		border: 1px solid var(--color-interface-border);
		padding: 1rem;
		min-width: 300px;
		z-index: 100;
	}

	dialog h3 {
		margin: 0 0 1rem;
	}

	dialog input {
		width: 100%;
	}

	dialog menu {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		padding: 0;
		margin: 0.5rem 0;
	}

	dialog menu button {
		font-size: 0.85em;
	}

	dialog footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
</style>
