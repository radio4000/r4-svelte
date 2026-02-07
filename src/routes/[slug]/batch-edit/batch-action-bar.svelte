<script>
	import {batchUpdateTracksUniform, deleteTrackMeta, insertDurationFromMeta} from '$lib/tanstack/collections'
	import {pull as pullYouTubeMeta} from '$lib/metadata/youtube'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {getChannelTags} from '$lib/utils'

	const uid = $props.id()

	/** @type {{selectedIds?: string[], channel: import('$lib/types').Channel | null, allTags?: {value: string, count: number}[], tracks?: import('$lib/types').TrackWithMeta[] }} */
	let {selectedIds = [], channel, allTags = [], tracks = []} = $props()

	let showAppend = $state(false)
	let showRemoveTag = $state(false)
	let appendText = $state('')
	let fetchingMeta = $state(false)
	let fetchProgress = $state({current: 0, total: 0})

	/** @type {import('$lib/types').TrackWithMeta[]} */
	let selectedTracks = $derived(selectedIds.map((id) => tracks.find((t) => t.id === id)).filter((t) => t !== undefined))

	// Selected tracks missing YouTube metadata
	let selectedMissingMeta = $derived(selectedTracks.filter((t) => !t.youtube_data && !t.playback_error))

	// Tracks that have metadata duration but no track duration
	let tracksWithMetaDuration = $derived(selectedTracks.filter((t) => !t.duration && t.youtube_data?.duration))

	// Tracks that have a duration set
	let tracksWithDuration = $derived(selectedTracks.filter((t) => t.duration))

	// Tracks that have any metadata
	let tracksWithMeta = $derived(selectedTracks.filter((t) => t.youtube_data || t.musicbrainz_data || t.discogs_data))

	// Tags present in selected tracks
	let selectedTracksTags = $derived(getChannelTags(selectedTracks))

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
		const mediaIds = /** @type {string[]} */ (tracksWithMeta.map((t) => t.media_id).filter(Boolean))
		if (mediaIds.length === 0) return
		deleteTrackMeta(mediaIds)
	}

	async function fetchMeta() {
		if (fetchingMeta || selectedMissingMeta.length === 0 || !channel) return
		fetchingMeta = true
		fetchProgress = {current: 0, total: 0}
		try {
			const mediaIds = /** @type {string[]} */ (selectedMissingMeta.map((t) => t.media_id).filter(Boolean))
			await pullYouTubeMeta(mediaIds, {
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
				{@attach tooltip({content: 'Copy duration from YouTube metadata to track'})}
				>Copy duration ({tracksWithMetaDuration.length})</button
			>
		{/if}

		{#if tracksWithDuration.length > 0}
			<button onclick={removeDuration} {@attach tooltip({content: 'Clear the duration field from selected tracks'})}
				>Remove duration ({tracksWithDuration.length})</button
			>
		{/if}

		{#if selectedMissingMeta.length > 0}
			<button
				onclick={fetchMeta}
				disabled={fetchingMeta}
				{@attach tooltip({content: 'Fetch YouTube metadata for selected tracks'})}
			>
				{fetchingMeta
					? `Fetching... (${fetchProgress.current}/${fetchProgress.total})`
					: `Fetch meta (${selectedMissingMeta.length})`}
			</button>
		{/if}

		{#if tracksWithMeta.length > 0}
			<button onclick={removeMeta} {@attach tooltip({content: 'Delete cached YouTube/MusicBrainz/Discogs metadata'})}
				>Remove meta ({tracksWithMeta.length})</button
			>
		{/if}

		<hr />

		<button
			onclick={() => (showAppend = true)}
			disabled={selectedIds.length === 0}
			{@attach tooltip({content: 'Add text or tags to track descriptions'})}
		>
			Append text...
		</button>
		<button
			onclick={() => (showRemoveTag = true)}
			disabled={selectedTracksTags.length === 0}
			{@attach tooltip({content: 'Remove a specific tag from all selected tracks'})}>Remove tag...</button
		>
	{:else}
		&nbsp;
	{/if}
</aside>

{#if showAppend}
	<dialog open>
		<h3>Append to {selectedIds.length} tracks</h3>
		<form
			class="form"
			onsubmit={(e) => {
				e.preventDefault()
				append(appendText)
			}}
		>
			<fieldset>
				<label for="{uid}-append" class="visually-hidden">Text to append</label>
				<input id="{uid}-append" type="text" bind:value={appendText} placeholder="text to append" autofocus />
			</fieldset>
			{#if allTags.length > 0}
				<menu>
					{#each allTags.slice(0, 10) as { value } (value)}
						<button type="button" onclick={() => (appendText = appendText ? `${appendText} #${value}` : `#${value}`)}
							>#{value}</button
						>
					{/each}
				</menu>
			{/if}
			<footer>
				<button type="button" onclick={closeDialogs}>Cancel</button>
				<button type="submit" disabled={!appendText.trim()}>Append</button>
			</footer>
		</form>
	</dialog>
{/if}

{#if showRemoveTag}
	<dialog open>
		<h3>Remove tag from {selectedIds.length} tracks</h3>
		<menu>
			{#each selectedTracksTags as { tag, count } (tag)}
				<button onclick={() => removeTag(tag)}>#{tag} ({count})</button>
			{/each}
		</menu>
		<footer>
			<button onclick={closeDialogs}>Cancel</button>
		</footer>
	</dialog>
{/if}

<style>
	aside {
		display: flex;
		align-items: center;
		gap: 0.2rem;
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
		border: 1px solid var(--gray-5);
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
		gap: 0.25rem;
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
