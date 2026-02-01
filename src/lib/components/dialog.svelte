<script>
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {showModal = $bindable(), header, children} = $props()

	let dialog = $state()

	$effect(() => {
		if (showModal) {
			dialog.showModal()
		} else {
			dialog.close()
		}
	})
</script>

<dialog
	bind:this={dialog}
	onclose={() => (showModal = false)}
	onclick={(e) => {
		if (e.target === dialog) dialog.close()
	}}
>
	<div>
		<header>
			{@render header?.()}
			<!-- svelte-ignore a11y_autofocus -->
			<button autofocus onclick={() => dialog.close()} title={m.modal_close_label()} aria-label={m.modal_close_label()}>
				<Icon icon="close" size={20} />
			</button>
		</header>
		{@render children?.()}
	</div>
</dialog>

<style>
	dialog {
		--duration: 200ms;
		border: none;
		width: 100%;
		background: none;
		padding: calc(0.2px + 13vh) 12px 13vh;
	}
	dialog[open] {
		animation: modal-in var(--duration) ease-out;
	}
	@keyframes modal-in {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	dialog::backdrop {
		background: lch(0 0 0 / 0.275);
		opacity: 1;
		transition:
			opacity var(--duration) ease-out,
			display var(--duration) allow-discrete,
			overlay var(--duration) allow-discrete;
	}
	@starting-style {
		dialog[open]::backdrop {
			opacity: 0;
		}
	}
	dialog > div {
		max-width: 640px;
		margin: auto;
		flex: 1;
		background: var(--gray-3);
		box-shadow:
			lch(0 0 0 / 0.15) 0px 4px 40px,
			lch(0 0 0 / 0.188) 0px 3px 20px,
			lch(0 0 0 / 0.188) 0px 3px 12px,
			lch(0 0 0 / 0.188) 0px 2px 8px,
			lch(0 0 0 / 0.188) 0px 1px 1px;
		border: 1px solid var(--gray-12);
		border-radius: var(--border-radius);
		padding: 1em;
		transform-origin: 50% 50% 0px;
	}
	header {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	header :global(h2) {
		margin: 0;
	}
</style>
