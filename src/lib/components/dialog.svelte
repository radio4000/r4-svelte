<script>
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	let {showModal = $bindable(), header = undefined, footer = undefined, children} = $props()

	let dialog = $state()
	let mousedownTarget = $state()

	$effect(() => {
		if (showModal) {
			// A fullscreen element (e.g. a full-size deck) covers top-layer dialogs
			// mounted outside of it — leave fullscreen so the dialog is visible
			if (document.fullscreenElement && !document.fullscreenElement.contains(dialog)) {
				document.exitFullscreen()
			}
			dialog.showModal()
		} else {
			dialog.close()
		}
	})
</script>

<dialog
	bind:this={dialog}
	onclose={() => (showModal = false)}
	onmousedown={(e) => (mousedownTarget = e.target)}
	onclick={(e) => {
		if (e.target === dialog && mousedownTarget === dialog) dialog.close()
	}}
>
	<div class="dialog-panel">
		<header class="dialog-header">
			{@render header?.()}
			<button
				onclick={() => dialog.close()}
				title={m.modal_close_label()}
				aria-label={m.modal_close_label()}
			>
				<Icon icon="close" />
			</button>
		</header>
		<section class="dialog-body">
			{@render children?.()}
		</section>
		{#if footer}
			<footer class="dialog-footer">
				{@render footer()}
			</footer>
		{/if}
	</div>
</dialog>

<style>
	dialog {
		--duration: var(--duration-2);
		border: none;
		width: 100%;
		max-width: 100%;
		max-height: 100dvh;
		background: none;
		padding: clamp(0.5rem, 5dvh, 3rem) 0.75rem;
		overflow-y: auto;
		box-sizing: border-box;
		opacity: 1;
		scale: 1;
		transition:
			opacity var(--duration) var(--ease-out),
			scale var(--duration) var(--ease-out),
			display var(--duration) allow-discrete,
			overlay var(--duration) allow-discrete;
	}
	/* exit — quicker than the entrance */
	dialog:not([open]) {
		--duration: var(--duration-1);
		opacity: 0;
		scale: 0.98;
	}
	@starting-style {
		dialog[open] {
			opacity: 0;
			scale: 0.98;
		}
	}
	dialog::backdrop {
		background: oklch(0 0 0 / 0.8);
		backdrop-filter: blur(6px);
		opacity: 1;
		transition:
			opacity var(--duration) var(--ease-out),
			display var(--duration) allow-discrete,
			overlay var(--duration) allow-discrete;
	}
	dialog:not([open])::backdrop {
		opacity: 0;
	}
	@starting-style {
		dialog[open]::backdrop {
			opacity: 0;
		}
	}
	.dialog-panel {
		max-width: 640px;
		margin: auto;
		width: min(100%, 640px);
		max-height: min(calc(100dvh - 2 * clamp(0.5rem, 5dvh, 3rem)), 760px);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		background: var(--gray-1);
		box-shadow:
			lch(0 0 0 / 0.15) 0px 4px 40px,
			lch(0 0 0 / 0.188) 0px 3px 20px,
			lch(0 0 0 / 0.188) 0px 3px 12px,
			lch(0 0 0 / 0.188) 0px 2px 8px,
			lch(0 0 0 / 0.188) 0px 1px 1px;
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: 1em;
		transform-origin: 50% 50% 0px;
		overflow: hidden;
	}
	.dialog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		position: sticky;
		top: 0;
		z-index: 1;
		background: inherit;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-interface-border);
	}
	.dialog-header :global(h2) {
		margin: 0;
	}
	.dialog-body {
		overflow: auto;
		padding-block: 0.75rem;
	}
	.dialog-footer {
		position: sticky;
		bottom: 0;
		z-index: 1;
		background: inherit;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-interface-border);
	}
</style>
