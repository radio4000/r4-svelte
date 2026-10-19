<script>
	import {untrack} from 'svelte'
	import {Debounced} from 'runed'
	import {appState} from '#lib/app-state.svelte.js'
	import {setTheme} from '#lib/api.js'
	import {applyCustomCssVariables} from '#lib/apply-css-variables.js'
	import {fontFamilies, colorVars} from '#lib/components/theme-editor.data.js'
	import InputColor from '#lib/components/input-color.svelte'
	import InputRange from '#lib/components/input-range.svelte'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const uid = 'theme-editor'

	/** @type {{name: string, value: string} | null} */
	let pendingUpdate = $state(null)
	const debouncedUpdate = new Debounced(() => pendingUpdate, 300)

	// untrack the writes so reset (which reassigns custom_css_variables) can't
	// re-trigger this effect and re-inject the last edit.
	$effect(() => {
		const update = debouncedUpdate.current
		if (!update) return
		untrack(() => {
			if (update.value) {
				appState.custom_css_variables[update.name] = update.value
			} else {
				delete appState.custom_css_variables[update.name]
			}
		})
	})

	const themes = ['light', 'dark']
	const themeTitle = (theme) => (theme === 'light' ? 'Light' : 'Dark')
	const colorsFor = (theme) => colorVars.filter((v) => v.theme === theme)

	function resolveFallbackColors(vars) {
		const probe = document.createElement('button')
		probe.className = 'btn'
		probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
		document.body.appendChild(probe)
		const resolved = {}
		for (const variable of vars) {
			if (!variable.probeStyle) continue
			probe.style.colorScheme = variable.theme
			resolved[variable.name] = getComputedStyle(probe)[variable.probeStyle]
		}
		probe.remove()
		return resolved
	}

	const themeOptions = [
		{value: undefined, label: 'System', icon: 'eye'},
		{value: 'light', label: 'Light', icon: 'sun'},
		{value: 'dark', label: 'Dark', icon: 'moon'}
	]

	const customVariables = $derived(appState.custom_css_variables || {})

	// Button override swatches read defaults from computed .btn styles.
	let resolvedDefaults = $state({})
	$effect(() => {
		void customVariables
		resolvedDefaults = resolveFallbackColors(colorVars)
	})

	const getCurrentValue = (variable) =>
		customVariables[variable.name] ?? resolvedDefaults[variable.name] ?? variable.default

	const updateVariable = (name, value) => {
		const trimmed = value.trim()
		// Apply CSS immediately for live preview
		applyCustomCssVariables({...customVariables, [name]: trimmed})
		// Debounce persistence to appState
		pendingUpdate = {name, value: trimmed}
	}
	const resetToDefaults = () => {
		appState.custom_css_variables = {}
		appState.font_family = undefined
		applyCustomCssVariables($state.snapshot(appState.custom_css_variables))
	}

	let importText = $state('')
	let exportString = $derived(
		Object.entries(appState.custom_css_variables || {})
			.map(([key, value]) => `${key}:${value}`)
			.join(';')
	)

	function copyTheme() {
		navigator.clipboard.writeText(exportString)
	}

	const importTheme = () => {
		const variables = Object.fromEntries(
			importText
				.split(';')
				.map((pair) => pair.split(':').map((s) => s.trim()))
				.filter(([key, value]) => key && value)
				.map(([key, value]) => [key.startsWith('--') ? key : `--${key}`, value])
		)
		if (!Object.keys(variables).length) return
		appState.custom_css_variables = {...appState.custom_css_variables, ...variables}
		applyCustomCssVariables($state.snapshot(appState.custom_css_variables))
		importText = ''
	}
</script>

{#snippet cssToggle(name, label)}
	<fieldset>
		<label for={`${uid}${name}`}>{label}</label>
		<input
			type="checkbox"
			checked={(customVariables[name] ?? '0.5rem') !== '0'}
			onchange={(e) => updateVariable(name, e.currentTarget.checked ? '0.5rem' : '0')}
			id={`${uid}${name}`}
		/>
	</fieldset>
{/snippet}

<div class="focused">
	<section class="box">
		<form class="form">
			<fieldset>
				<label for={`${uid}-theme`}>{m.theme_theme_label()}</label>
				<menu class="theme-switch" id={`${uid}-theme`}>
					{#each themeOptions as opt (opt.label)}
						<button
							type="button"
							class:active={(appState.theme ?? 'system') === (opt.value ?? 'system')}
							aria-pressed={(appState.theme ?? 'system') === (opt.value ?? 'system')}
							onclick={() => setTheme(opt.value)}
						>
							<Icon icon={opt.icon} strokeWidth={1.7} />
							{opt.label}
						</button>
					{/each}
				</menu>
			</fieldset>
			<fieldset class="row">
				<label for={`${uid}--scaling`}
					>{m.theme_scale_label()} <span>{customVariables['--scaling'] || '1'}</span>
				</label>
				<InputRange
					value={Number(customVariables['--scaling']) || 1}
					min={0.8}
					max={1.2}
					step={0.05}
					id={`${uid}--scaling`}
					oninput={(e) =>
						updateVariable('--scaling', /** @type {HTMLInputElement} */ (e.target).value)}
				/>
			</fieldset>

			{@render cssToggle('--border-radius', m.theme_corners_label())}

			<fieldset>
				<label for={`${uid}-show-artwork`}>{m.theme_show_artwork_label()}</label>
				<input
					type="checkbox"
					bind:checked={appState.show_track_artwork}
					id={`${uid}-show-artwork`}
				/>
			</fieldset>

			<fieldset>
				<label for={`${uid}-pointer-cursor`}>{m.theme_pointer_cursor_label()}</label>
				<input
					type="checkbox"
					bind:checked={appState.use_pointer_cursor}
					id={`${uid}-pointer-cursor`}
				/>
			</fieldset>

			<fieldset>
				<label for={`${uid}-floating-ui`}>{m.theme_floating_ui_label()}</label>
				<input type="checkbox" bind:checked={appState.floating_ui} id={`${uid}-floating-ui`} />
			</fieldset>

			<fieldset>
				<label for={`${uid}-show-borders`}>{m.theme_show_borders_label()}</label>
				<input type="checkbox" bind:checked={appState.show_borders} id={`${uid}-show-borders`} />
			</fieldset>

			<fieldset class="row">
				<label for={`${uid}-font-family`}>{m.theme_font_label()}</label>
				<select
					id={`${uid}-font-family`}
					value={appState.font_family || ''}
					onchange={(e) => {
						appState.font_family = e.currentTarget.value || undefined
					}}
				>
					{#each fontFamilies as font (font.value)}
						<option value={font.value} style:font-family={font.value || null}>{font.label}</option>
					{/each}
				</select>
			</fieldset>
		</form>
	</section>

	<h2>{m.theme_create_heading()}</h2>
	<div class="theme-split">
		{#each themes as theme (theme)}
			<section class="box theme-column" style:color-scheme={theme}>
				<h3>{themeTitle(theme)}</h3>
				<form class="form color-form">
					{#each colorsFor(theme) as variable (variable.name)}
						<fieldset>
							<InputColor
								label={variable.label()}
								value={getCurrentValue(variable)}
								onchange={(e) => updateVariable(variable.name, e.target.value)}
							/>
						</fieldset>
					{/each}
				</form>
			</section>
		{/each}
	</div>
	<button type="button" onclick={resetToDefaults} class="theme-reset"
		>{m.theme_reset_button()}</button
	>

	<details class="theme-share">
		<summary>{m.theme_share_heading()}</summary>
		<form class="form share-form">
			<fieldset>
				<label for="{uid}-export" class="visually-hidden">{m.theme_copy_button()}</label>
				<input id="{uid}-export" type="text" readonly value={exportString} />
				<button type="button" onclick={copyTheme}>{m.theme_copy_button()}</button>
			</fieldset>
			<fieldset>
				<label for="{uid}-import" class="visually-hidden">{m.theme_apply_button()}</label>
				<input
					id="{uid}-import"
					type="text"
					bind:value={importText}
					placeholder={m.theme_import_placeholder()}
				/>
				<button type="button" onclick={importTheme} disabled={!importText.trim()}
					>{m.theme_apply_button()}</button
				>
			</fieldset>
		</form>
	</details>
</div>

<style>
	.focused {
		display: flex;
		flex-flow: column;
		gap: var(--space-3);
		/* Fill the page's constrained column — the inherited margin-inline: auto
		   would otherwise shrink this to its content width. */
		width: 100%;
		margin-inline: 0;
	}

	.box {
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: var(--space-2);
	}

	h2 {
		margin: 0;
	}

	fieldset {
		align-items: flex-start;
	}

	fieldset.row {
		flex-flow: row;
		align-items: center;
		gap: var(--space-2);
	}

	fieldset:has(input[type='checkbox']) {
		flex-flow: row;
		place-items: center;
		label {
			order: 2;
		}
	}

	label {
		/* larger than defaults */
		font-size: var(--font-4);
	}

	.theme-switch {
		display: flex;
		gap: var(--space-1);
		margin: 0;
		padding: 0;

		button {
			flex: 1;
			gap: var(--space-1);
		}
	}

	.theme-share summary {
		font-size: var(--font-5);
		font-weight: 600;
		cursor: var(--interactive-cursor, pointer);
	}

	.theme-share[open] summary {
		margin-bottom: var(--space-2);
	}

	.share-form fieldset {
		flex-flow: row;
	}

	.share-form input {
		flex: 1;
	}

	.theme-split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-2);
	}

	@media (max-width: 520px) {
		.theme-split {
			grid-template-columns: 1fr;
		}
	}

	/* gray-1/gray-12 resolve per the column's forced color-scheme, so each
	   column previews its own mode */
	.theme-column {
		margin-bottom: 0;
		background: var(--gray-1);
		color: var(--gray-12);
	}

	.theme-column h3 {
		margin-bottom: 0.5rem;
	}

	.theme-reset {
		align-self: start;
	}
</style>
