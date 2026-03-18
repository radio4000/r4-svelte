<script>
	function focusAddTrackButton() {
		const btn = /** @type {HTMLElement | null} */ (document.querySelector('[data-add-track]'))
		btn?.focus()
	}
</script>

<p class="add-track-hint">
	Click the <button type="button" onclick={focusAddTrackButton}>+</button> button to add your first track.
</p>

<style>
	.add-track-hint {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		flex-wrap: wrap;
	}

	button {
		font-size: inherit;
		line-height: 1;
		padding: 0.1em 0.4em;
		border: 1px solid currentColor;
		border-radius: var(--border-radius, 4px);
		background: none;
		cursor: pointer;
		color: var(--accent-9);

		&:hover,
		&:focus {
			background: var(--accent-3);
		}
	}
</style>
