<script>
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import Dialog from '#lib/components/dialog.svelte'
	import {DEFAULT_KEY_BINDINGS, getActionLabel} from '#lib/keyboard.js'
	import * as m from '#lib/paraglide/messages.js'

	let showModal = $state(false)

	const keyBindings = $derived({...DEFAULT_KEY_BINDINGS, ...appState.shortcuts})

	$effect(() => {
		if (appState.modal_shortcuts) {
			showModal = true
			appState.modal_shortcuts = false
		}
	})
</script>

<Dialog bind:showModal>
	{#snippet header()}
		<h2>{m.shortcuts_heading()}</h2>
	{/snippet}

	<dl>
		{#each Object.entries(keyBindings) as [key, action] (key)}
			<div>
				<dt><kbd>{key || m.shortcuts_unset()}</kbd></dt>
				<dd>{getActionLabel(action)}</dd>
			</div>
		{/each}
	</dl>

	<footer>
		<a href={resolve('/settings/keyboard')} onclick={() => (showModal = false)}
			>{m.shortcuts_edit()}</a
		>
	</footer>
</Dialog>

<style>
	dl {
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	dl > div {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
		align-items: center;
	}

	dt,
	dd {
		margin: 0;
	}

	kbd {
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: var(--space-1) 0.5rem;
		min-width: 3rem;
		text-align: center;
		font-family: inherit;
		background: var(--gray-2);
	}

	footer {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-interface-border);
	}
</style>
