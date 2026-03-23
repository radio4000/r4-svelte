<script>
	let {track, field, onEdit, onTab, canEdit = true, isFocused = false} = $props()

	let isEditing = $state(false)
	let value = $derived(track?.[field] || '')

	// Start editing when cell becomes focused
	$effect(() => {
		if (isFocused && canEdit && !isEditing) {
			isEditing = true
		}
	})

	function startEdit(e) {
		if (!canEdit) return
		e?.stopPropagation()
		isEditing = true
	}

	function stopEdit() {
		isEditing = false
	}

	async function commitEdit(newValue) {
		stopEdit()
		if (newValue !== value) {
			await onEdit(track.id, field, newValue)
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		const input = /** @type {HTMLInputElement} */ (e.target)
		if (e.key === 'Enter') {
			e.preventDefault()
			commitEdit(input.value)
		} else if (e.key === 'Escape') {
			e.preventDefault()
			stopEdit()
		} else if (e.key === 'Tab') {
			e.preventDefault()
			commitEdit(input.value)
			onTab?.(e.shiftKey ? -1 : 1)
		}
	}
</script>

{#if isEditing}
	<input
		type="text"
		{value}
		class="inline-input"
		onblur={(e) => commitEdit(/** @type {HTMLInputElement} */ (e.target).value)}
		onkeydown={handleKeydown}
		{@attach (el) => {
			el.focus()
			el.select()
		}}
	/>
{:else}
	<span class="editable" class:readonly={!canEdit} ondblclick={startEdit}>
		{value}&nbsp;
	</span>
{/if}

<style>
	.editable {
		cursor: var(--interactive-cursor, pointer);
		display: block;
		width: 100%;
	}

	.editable.readonly {
		cursor: default;
	}

	.inline-input {
		width: 100%;
		font: inherit;
	}
</style>
