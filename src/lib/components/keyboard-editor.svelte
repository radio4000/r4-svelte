<script>
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import Icon from '$lib/components/icon.svelte'
	import {DEFAULT_KEY_BINDINGS, initializeKeyboardShortcuts} from '$lib/keyboard'

	const appState = useAppState()

	const uid = $props.id()

	let editing = $state(false)

	let keyBindings = $derived.by(() => {
		return appState?.shortcuts || DEFAULT_KEY_BINDINGS
	})

	const shortcutActions = [
		'togglePlayerExpanded',
		'openSearch',
		'togglePlayPause',
		'toggleQueuePanel',
		'toggleTheme',
		'toggleShuffle'
	]

	const availableActions = shortcutActions.map((name) => ({
		name,
		label: name.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())
	}))

	function handleDone() {
		editing = false
		initializeKeyboardShortcuts()
	}

	function addKeyBinding() {
		appStateCollection.update(1, (draft) => {
			const shortcuts = {...draft.shortcuts}
			shortcuts[''] = 'togglePlayPause'
			draft.shortcuts = shortcuts
		})
	}

	function removeKeyBinding(key) {
		appStateCollection.update(1, (draft) => {
			const shortcuts = {...draft.shortcuts}
			delete shortcuts[key]
			draft.shortcuts = shortcuts
		})
	}

	function updateKeyBindingKey(oldKey, newKey) {
		if (oldKey !== newKey) {
			appStateCollection.update(1, (draft) => {
				const shortcuts = {...draft.shortcuts}
				const action = shortcuts[oldKey]
				delete shortcuts[oldKey]
				shortcuts[newKey] = action
				draft.shortcuts = shortcuts
			})
		}
	}

	function updateKeyBindingAction(key, action) {
		appStateCollection.update(1, (draft) => {
			const shortcuts = {...draft.shortcuts}
			shortcuts[key] = action
			draft.shortcuts = shortcuts
		})
	}

	function resetToDefaults() {
		appStateCollection.update(1, (draft) => {
			draft.shortcuts = structuredClone(DEFAULT_KEY_BINDINGS)
		})
	}
</script>

<section>
	<header>
		<h2>Keyboard shortcuts</h2>
		{#if !editing}
			<button onclick={() => (editing = true)}>Edit shortcuts</button>
		{:else}
			<button onclick={handleDone}>Done</button>
		{/if}
	</header>

	{#if !editing}
		<dl>
			{#each Object.entries(keyBindings) as [key, action] (key)}
				<div>
					<dt><kbd>{key || 'unset'}</kbd></dt>
					<dd>{action.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<form onsubmit={handleDone}>
			{#each Object.entries(keyBindings) as [key, action] (key)}
				<div>
					<label for={`${uid}-key`}>Key</label>
					<input
						type="text"
						value={key}
						placeholder="e.g. k, $mod+k, Escape"
						onchange={(e) => updateKeyBindingKey(key, /** @type {HTMLInputElement} */ (e.target).value)}
						id={`${uid}-key`}
					/>
					<label for={`${uid}-action`}>&rarr;</label>
					<select
						value={action}
						onchange={(e) => updateKeyBindingAction(key, /** @type {HTMLSelectElement} */ (e.target).value)}
						id={`${uid}-action`}
					>
						{#each availableActions as { name, label } (name)}
							<option value={name}>{label}</option>
						{/each}
					</select>
					<button type="button" onclick={() => removeKeyBinding(key)}>
						<Icon icon="delete" size={16} />
					</button>
				</div>
			{/each}

			<button type="button" onclick={addKeyBinding}>+ Add shortcut</button>

			<footer>
				<button type="button" onclick={resetToDefaults}>Reset to defaults</button>
			</footer>
		</form>

		<p>
			Key reference, use <a href="https://jamiebuilds.github.io/tinykeys/" target="_blank" rel="noopener noreferrer"
				>tinykeys syntax</a
			>. Examples: <code>k</code>, <code>$mod+k</code>, <code>Escape</code>, <code>ArrowUp</code>
		</p>
	{/if}
</section>

<style>
	section {
		margin-bottom: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		margin-bottom: 1rem;
		gap: 1rem;
	}

	dl {
		margin: 0 0 0 1rem;
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
		border: 1px solid var(--gray-5);
		border-radius: var(--border-radius);
		padding: 0.2rem 0.5rem;
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
		border-top: 1px solid var(--gray-5);
	}

	code {
		background: var(--gray-3);
		padding: 0.125rem 0.2rem;
		border-radius: var(--border-radius);
	}

	form,
	dl {
		margin-left: 1rem;
	}

	form {
		display: flex;
		flex-flow: column;
		gap: 0.2rem;
		align-items: flex-start;
	}
</style>
