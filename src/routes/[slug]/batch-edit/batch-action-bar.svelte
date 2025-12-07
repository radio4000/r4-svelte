<script>
	import {tracksCollection, batchUpdateTracks, batchDeleteTracks} from '../../tanstack/collections'

	/** @type {{selectedIds?: string[], channel: import('$lib/types').Channel | null, allTags?: {tag: string, count: number}[], onClear?: () => void}} */
	let {selectedIds = [], channel, allTags = [], onClear = () => {}} = $props()

	let showAddTag = $state(false)
	let showRemoveTag = $state(false)
	let showDeleteConfirm = $state(false)
	let newTag = $state('')
	let deleteConfirmInput = $state('')

	/** @type {import('$lib/types').Track[]} */
	let selectedTracks = $derived(selectedIds.map((id) => tracksCollection.get(id)).filter((t) => t !== undefined))

	// Tags present in selected tracks
	let selectedTracksTags = $derived.by(() => {
		const counts = {}
		for (const track of selectedTracks) {
			for (const tag of track.tags || []) {
				counts[tag] = (counts[tag] || 0) + 1
			}
		}
		return Object.entries(counts)
			.map(([tag, count]) => ({tag, count}))
			.sort((a, b) => b.count - a.count)
	})

	function closeDialogs() {
		showAddTag = false
		showRemoveTag = false
		showDeleteConfirm = false
		newTag = ''
		deleteConfirmInput = ''
	}

	async function addTag(tag) {
		if (!tag || !channel) return
		const tagToAdd = tag.startsWith('#') ? tag : `#${tag}`

		for (const track of selectedTracks) {
			const desc = track.description || ''
			// Skip if tag already present
			if (desc.includes(tagToAdd)) continue
			const newDesc = desc ? `${desc} ${tagToAdd}` : tagToAdd
			await batchUpdateTracks(channel, [track.id], {description: newDesc})
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
				await batchUpdateTracks(channel, [track.id], {description: newDesc})
			}
		}
		closeDialogs()
	}

	async function deleteSelected() {
		if (!channel) return
		await batchDeleteTracks(channel, selectedIds)
		onClear()
		closeDialogs()
	}
</script>

<aside>
	<span class="count">Selected: {selectedIds.length}</span>

	<button onclick={() => (showAddTag = true)}>Add Tag...</button>
	<button onclick={() => (showRemoveTag = true)} disabled={selectedTracksTags.length === 0}> Remove Tag... </button>
	<button class="danger" onclick={() => (showDeleteConfirm = true)}>Delete...</button>
	<button onclick={onClear}>Clear</button>
</aside>

{#if showAddTag}
	<dialog open>
		<h3>Add tag to {selectedIds.length} tracks</h3>
		<form
			onsubmit={(e) => {
				e.preventDefault()
				addTag(newTag)
			}}
		>
			<input type="text" bind:value={newTag} placeholder="#tag" autofocus />
			<menu>
				{#each allTags.slice(0, 10) as { tag } (tag)}
					<button type="button" onclick={() => addTag(tag)}>#{tag}</button>
				{/each}
			</menu>
			<footer>
				<button type="button" onclick={closeDialogs}>Cancel</button>
				<button type="submit" disabled={!newTag.trim()}>Add</button>
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

{#if showDeleteConfirm}
	{@const confirmText = `delete ${selectedIds.length}`}
	<dialog open>
		<h3>Delete {selectedIds.length} tracks?</h3>
		<p><strong>This cannot be undone.</strong></p>
		<p>Type <code>{confirmText}</code> to confirm:</p>
		<form
			onsubmit={(e) => {
				e.preventDefault()
				if (deleteConfirmInput === confirmText) deleteSelected()
			}}
		>
			<input type="text" bind:value={deleteConfirmInput} placeholder={confirmText} autofocus />
			<footer>
				<button type="button" onclick={closeDialogs}>Cancel</button>
				<button type="submit" class="danger" disabled={deleteConfirmInput !== confirmText}>
					Delete {selectedIds.length} tracks
				</button>
			</footer>
		</form>
	</dialog>
{/if}

<style>
	aside {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		margin: 0.5rem;
		/*padding: 0.5rem;*/
		/*background: var(--gray-2);*/
		/*border-bottom: 1px solid var(--gray-5);*/
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
		margin-bottom: 0.5rem;
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
