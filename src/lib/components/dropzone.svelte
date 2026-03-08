<script>
	/**
	 * Drag-and-drop zone. Manages hover state and CSS.
	 * Renders as `as` element (default: 'label' for wrapping a file input;
	 * use 'button' when triggering a JS action like showDirectoryPicker).
	 * All extra props (onclick, disabled, ondrop, …) are forwarded to the element.
	 */
	const {as = 'label', children, ondrop, ...rest} = $props()
	let dragOver = $state(false)
</script>

<svelte:element
	this={as}
	class="dropzone"
	class:drag-over={dragOver}
	ondragover={(e) => {
		e.preventDefault()
		dragOver = true
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={(e) => {
		dragOver = false
		e.preventDefault()
		ondrop?.(e)
	}}
	{...rest}
>
	{@render children()}
</svelte:element>

<style>
	.dropzone {
		display: block;
		width: 100%;
		border: 2px dashed var(--gray-6);
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
		cursor: pointer;
		&:hover,
		&.drag-over {
			border-color: var(--accent-9);
			background: var(--accent-2);
		}
	}

	:global(.dropzone input[type='file']) {
		display: none;
	}

	:global(.dropzone .browse-link) {
		text-decoration: underline;
	}
</style>
