<script>
	import {Debounced} from 'runed'
	import {appState} from '$lib/app-state.svelte'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import InputColor from '$lib/components/input-color.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import ThemeToggle from '$lib/components/theme-toggle.svelte'
	import * as m from '$lib/paraglide/messages'
	import {logger} from '$lib/logger'

	const log = logger.ns('theme').seal()

	const uid = $props.id()

	const fontFamilies = [
		{value: '', label: 'Firava (default)'},
		{value: 'Rosario', label: 'Rosario'},
		{value: 'Radio Canada', label: 'Radio Canada'},
		{value: 'Recursive', label: 'Recursive'},
		{value: 'Epilogue', label: 'Epilogue'},
		{value: 'Sono', label: 'Sono'},
		{value: 'var(--font-system)', label: 'System'}
	]

	const baseColors = [
		{
			name: '--accent-light',
			label: () => m.theme_color_accent_light_label(),
			description: () => m.theme_color_accent_desc(),
			default: 'oklch(0.5 0.25 290)',
			theme: 'light'
		},
		{
			name: '--accent-dark',
			label: () => m.theme_color_accent_dark_label(),
			description: () => m.theme_color_accent_desc(),
			default: 'oklch(0.8 0.14 222)',
			theme: 'dark'
		},
		{
			name: '--gray-light',
			label: () => m.theme_color_gray_label(),
			description: () => m.theme_color_gray_desc(),
			default: 'oklch(0.67 0.01 0)',
			theme: 'light'
		},
		{
			name: '--gray-dark',
			label: () => m.theme_color_gray_label(),
			description: () => m.theme_color_gray_desc(),
			default: 'oklch(0.67 0.005 0)',
			theme: 'dark'
		}
	]

	const overrides = [
		{
			name: '--button-bg-light',
			label: () => m.theme_override_button_bg_label_light(),
			description: () => m.theme_override_button_bg_desc(),
			default: '#fff',
			theme: 'light'
		},
		{
			name: '--button-bg-dark',
			label: () => m.theme_override_button_bg_label_dark(),
			description: () => m.theme_override_button_bg_desc(),
			default: '#000',
			theme: 'dark'
		},
		{
			name: '--button-color-light',
			label: () => m.theme_override_button_color_label_light(),
			description: () => m.theme_override_button_text_desc(),
			default: '#000',
			theme: 'light'
		},
		{
			name: '--button-color-dark',
			label: () => m.theme_override_button_color_label_dark(),
			description: () => m.theme_override_button_text_desc(),
			default: '#fff',
			theme: 'dark'
		}
	]

	/** @type {{name: string, value: string} | null} */
	let pendingUpdate = $state(null)
	const debouncedUpdate = new Debounced(() => pendingUpdate, 300)

	// Persist debounced updates to appState
	$effect(() => {
		const update = debouncedUpdate.current
		if (!update) return
		if (update.value) {
			appState.custom_css_variables[update.name] = update.value
		} else {
			delete appState.custom_css_variables[update.name]
		}
	})

	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const currentTheme = $derived(appState.theme ?? (prefersLight ? 'light' : 'dark'))

	const isActiveVariable = (variable) => {
		// if (variable.theme === 'both') return true
		if (!currentTheme) return variable
		return variable.theme === currentTheme
	}

	const customVariables = $derived(appState.custom_css_variables || {})
	const getCurrentValue = (variable) => customVariables[variable.name] || variable.default

	const updateVariable = (name, value) => {
		const trimmed = value.trim()
		// Apply CSS immediately for live preview
		applyCustomCssVariables({...customVariables, [name]: trimmed})
		// Debounce persistence to appState
		pendingUpdate = {name, value: trimmed}
	}
	const resetToDefaults = () => {
		appState.custom_css_variables = {}
		applyCustomCssVariables($state.snapshot(appState.custom_css_variables))
	}

	let importText = $state('')
	let exportString = $derived.by(() => {
		const variables = appState.custom_css_variables || {}
		const themeString = Object.entries(variables)
			.map(([key, value]) => `${key}:${value}`)
			.join(';')
		return themeString
	})

	function copyTheme() {
		navigator.clipboard.writeText(exportString)
	}

	const importTheme = () => {
		if (!importText.trim()) return

		try {
			const variables = {}
			const pairs = importText.split(';')

			for (const pair of pairs) {
				if (!pair.trim()) continue
				const [key, value] = pair.split(':')
				if (!key || !value) continue

				let cleanKey = key.trim()
				if (!cleanKey.startsWith('--')) {
					cleanKey = `--${cleanKey}`
				}

				variables[cleanKey] = value.trim()
			}

			appState.custom_css_variables = {...appState.custom_css_variables, ...variables}
			applyCustomCssVariables($state.snapshot(appState.custom_css_variables))
			importText = ''
		} catch (error) {
			log.error('import theme failed', {error})
		}
	}

	const grays = Array.from(Array(12).keys(), (i) => `--gray-${i + 1}`)
	const accents = Array.from(Array(12).keys(), (i) => `--accent-${i + 1}`)
</script>

<div class="focused constrained">
	<section class="box">
		<form class="form">
			<fieldset>
				<p>{m.theme_theme_label()}</p>
				<ThemeToggle />
			</fieldset>
			<fieldset>
				<label for={`${uid}--scaling`}
					>{m.theme_scale_label()} <span>{customVariables['--scaling'] || '1'}</span>
				</label>
				<InputRange
					value={Number(customVariables['--scaling']) || 1}
					min={0.8}
					max={1.2}
					step={0.05}
					id={`${uid}--scaling`}
					oninput={(e) => {
						const v = /** @type {HTMLInputElement} */ (e.target).value.trim()
						appState.custom_css_variables['--scaling'] = v
						applyCustomCssVariables({...customVariables, '--scaling': v})
					}}
				/>
			</fieldset>

			<fieldset>
				<label for={`${uid}--border-radius`}>{m.theme_corners_label()}</label>
				<input
					type="checkbox"
					checked={customVariables['--border-radius'] ? customVariables['--border-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--border-radius', e.currentTarget.checked ? '0.4rem' : '0')}
					id={`${uid}--border-radius`}
				/>
			</fieldset>

			<fieldset>
				<label for={`${uid}--media-radius`}>{m.theme_artwork_label()}</label>
				<input
					type="checkbox"
					checked={customVariables['--media-radius'] ? customVariables['--media-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--media-radius', e.currentTarget.checked ? '0.4rem' : '0')}
					id={`${uid}--media-radius`}
				/>
			</fieldset>

			<fieldset>
				<label for={`${uid}-hide-artwork`}>{m.theme_hide_artwork_label()}</label>
				<input type="checkbox" bind:checked={appState.hide_track_artwork} id={`${uid}-hide-artwork`} />
			</fieldset>

			<fieldset>
				<label for={`${uid}-pointer-cursor`}>{m.theme_pointer_cursor_label()}</label>
				<input type="checkbox" bind:checked={appState.use_pointer_cursor} id={`${uid}-pointer-cursor`} />
			</fieldset>

			<fieldset>
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
	<section class="box">
		<form class="form color-form">
			{#each baseColors as variable, i (variable.name + i)}
				<fieldset class:inactive={!isActiveVariable(variable)}>
					<InputColor
						label={variable.label()}
						value={getCurrentValue(variable)}
						onchange={(e) => updateVariable(variable.name, e.target.value)}
						disabled={!getCurrentValue(variable)}
					/>
					<!--<small>{variable.description()}</small>-->
				</fieldset>
			{/each}

			{#each overrides as variable (variable.name)}
				<fieldset class:inactive={!isActiveVariable(variable)}>
					<InputColor
						label={variable.label()}
						value={getCurrentValue(variable)}
						onchange={(e) => updateVariable(variable.name, e.target.value)}
						disabled={!getCurrentValue(variable)}
					/>
					<!--<small>{variable.description()}</small>-->
				</fieldset>
			{/each}

			<button type="button" onclick={resetToDefaults} style:align-self="start">{m.theme_reset_button()}</button>
		</form>
	</section>

	<h2>{m.theme_share_heading()}</h2>
	<section class="box">
		<form class="form share-form">
			<fieldset>
				<label for="{uid}-export" class="visually-hidden">{m.theme_copy_button()}</label>
				<input id="{uid}-export" type="text" readonly value={exportString} />
				<button type="button" onclick={copyTheme}>{m.theme_copy_button()}</button>
			</fieldset>
			<fieldset>
				<label for="{uid}-import" class="visually-hidden">{m.theme_apply_button()}</label>
				<input id="{uid}-import" type="text" bind:value={importText} placeholder={m.theme_import_placeholder()} />
				<button type="button" onclick={importTheme} disabled={!importText.trim()}>{m.theme_apply_button()}</button>
			</fieldset>
		</form>
	</section>
</div>

<div class="color-grid">
	{#each grays as name (name)}
		<div class="color-swatch">
			<figure style="background-color: var({name})"></figure>
			<code>{name}</code>
		</div>
	{/each}
</div>

<div class="color-grid">
	{#each accents as name (name)}
		<div class="color-swatch">
			<figure style="background-color: var({name})"></figure>
			<code>{name}</code>
		</div>
	{/each}
</div>

<style>
	.box {
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	h2 {
		margin-block: 0 0.5rem;
	}

	fieldset {
		align-items: flex-start;
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

	.share-form fieldset {
		flex-flow: row;
	}

	.share-form input {
		flex: 1;
	}

	.inactive {
		display: none;
	}
</style>
