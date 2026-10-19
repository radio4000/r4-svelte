<script>
	import {appState} from '#lib/app-state.svelte.js'
	import Icon from '#lib/components/icon.svelte'
	import {
		DEFAULT_KEY_BINDINGS,
		SHORTCUT_ACTIONS,
		getActionLabel,
		initializeKeyboardShortcuts
	} from '#lib/keyboard.js'
	import * as m from '#lib/paraglide/messages.js'

	const uid = $props.id()

	let editing = $state(false)

	let keyBindings = $derived.by(() => {
		return appState.shortcuts || DEFAULT_KEY_BINDINGS
	})

	const shortcutActions = Object.keys(SHORTCUT_ACTIONS)

	function handleDone() {
		editing = false
		initializeKeyboardShortcuts()
	}

	function addKeyBinding() {
		const shortcuts = {...appState.shortcuts}
		shortcuts[''] = 'togglePlayPause'
		appState.shortcuts = shortcuts
	}

	function removeKeyBinding(key) {
		const shortcuts = {...appState.shortcuts}
		delete shortcuts[key]
		appState.shortcuts = shortcuts
	}

	function updateKeyBindingKey(oldKey, newKey) {
		if (oldKey !== newKey) {
			const shortcuts = {...appState.shortcuts}
			const action = shortcuts[oldKey]
			delete shortcuts[oldKey]
			shortcuts[newKey] = action
			appState.shortcuts = shortcuts
		}
	}

	function updateKeyBindingAction(key, action) {
		const shortcuts = {...appState.shortcuts}
		shortcuts[key] = action
		appState.shortcuts = shortcuts
	}

	function resetToDefaults() {
		appState.shortcuts = structuredClone(DEFAULT_KEY_BINDINGS)
	}

	const shortcutExamples = ['k', '$mod+k', 'Escape', 'ArrowUp']
</script>

<header>
	{#if !editing}
		<button onclick={() => (editing = true)}>{m.shortcuts_edit()}</button>
	{:else}
		<button onclick={handleDone}>{m.shortcuts_done()}</button>
	{/if}
</header>

<section class="box">
	{#if !editing}
		<dl>
			{#each Object.entries(keyBindings) as [key, action] (key)}
				<div>
					<dt><kbd>{key || m.shortcuts_unset()}</kbd></dt>
					<dd>{getActionLabel(action)}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<form class="form" onsubmit={handleDone}>
			{#each Object.entries(keyBindings) as [key, action], i (key)}
				<fieldset class="binding-row">
					<label for={`${uid}-key-${i}`} class="visually-hidden">{m.shortcuts_key_label()}</label>
					<input
						type="text"
						value={key}
						placeholder={m.shortcuts_key_placeholder()}
						onchange={(e) =>
							updateKeyBindingKey(key, /** @type {HTMLInputElement} */ (e.target).value)}
						id={`${uid}-key-${i}`}
					/>
					<span>&rarr;</span>
					<select
						value={action}
						onchange={(e) =>
							updateKeyBindingAction(key, /** @type {HTMLSelectElement} */ (e.target).value)}
						id={`${uid}-action-${i}`}
					>
						{#each shortcutActions as name (name)}
							<option value={name}>{getActionLabel(name)}</option>
						{/each}
					</select>
					<button type="button" onclick={() => removeKeyBinding(key)}>
						<Icon icon="delete" />
					</button>
				</fieldset>
			{/each}

			<button type="button" onclick={addKeyBinding}>{m.shortcuts_add()}</button>

			<footer>
				<button type="button" onclick={resetToDefaults}>{m.shortcuts_reset()}</button>
			</footer>
		</form>

		<p>
			{m.shortcuts_reference_intro()}
			<a href="https://jamiebuilds.github.io/tinykeys/" target="_blank" rel="noopener noreferrer">
				{m.shortcuts_reference_link()}
			</a>. {m.shortcuts_reference_examples()}
			{#each shortcutExamples as example, index (example)}
				<code>{example}</code>{#if index < shortcutExamples.length - 1},
				{/if}
			{/each}
		</p>
	{/if}
</section>

<style>
	.box {
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: 0.75rem;
		margin-bottom: 1rem;
		box-shadow: var(--shadow-modal);
	}

	header {
		display: flex;
		align-items: center;
		margin-bottom: 1rem;
		gap: 1rem;
	}

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
		background: var(--gray-2);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: var(--space-1) 0.5rem;
		min-width: 3rem;
		text-align: center;
	}

	input[type='text'] {
		width: 7rem;
	}

	footer {
		display: flex;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-interface-border);
	}

	code {
		background: var(--gray-3);
		padding: 0.125rem var(--space-1);
		border-radius: var(--border-radius);
	}

	form {
		align-items: flex-start;
	}

	.binding-row {
		flex-flow: row;
		align-items: center;
	}

	.binding-row input[type='text'] {
		width: 7rem;
	}
</style>
