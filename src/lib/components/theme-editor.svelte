<script>
	import {appState} from '$lib/app-state.svelte'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import InputColor from '$lib/components/input-color.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import ThemeToggle from '$lib/components/theme-toggle.svelte'
	import * as m from '$lib/paraglide/messages'

	const uid = $props.id()

	const fontSizes = ['--font-1', '--font-2', '--font-3', '--font-4', '--font-5', '--font-6', '--font-7', '--font-8']

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
			default: 'lch(86 48 124)',
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
			default: 'oklch(0.67 0.01 0)',
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

	let debounceTimer = $state()
	let applyTimer = $state()

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
		// Debounce both CSS application and database persistence
		clearTimeout(applyTimer)
		clearTimeout(debounceTimer)

		applyTimer = setTimeout(() => {
			applyCustomCssVariables({...customVariables, [name]: value.trim()})
		}, 50)

		debounceTimer = setTimeout(() => {
			if (value.trim()) {
				appState.custom_css_variables[name] = value.trim()
			} else {
				delete appState.custom_css_variables[name]
			}
		}, 300)
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
			console.error('Failed to import theme:', error)
		}
	}

	const grays = [...Array(12).keys()].map((i) => `--gray-${i + 1}`)
	const accents = [...Array(12).keys()].map((i) => `--accent-${i + 1}`)
</script>

<div class="SmallContainer">
	<section>
		<h1>{m.theme_heading()}</h1>
		<ThemeToggle />
	</section>

	<section>
		<h2>{m.theme_layout_heading()}</h2>
		<form>
			<div>
				<label for={`${uid}--scaling`}>{m.theme_scale_label()}</label>
				<InputRange
					value={Number(customVariables['--scaling']) || 1}
					min={0.9}
					max={1.1}
					step={0.05}
					id={`${uid}--scaling`}
					oninput={(e) => {
						updateVariable('--scaling', /** @type {HTMLInputElement} */ (e.target).value)
					}}
				/>
				<span>{customVariables['--scaling'] || '1'}</span>
				<small>{m.theme_scale_hint()}</small>
			</div>

			<div>
				<label for={`${uid}--border-radius`}>{m.theme_corners_label()}</label>
				<input
					type="checkbox"
					checked={customVariables['--border-radius'] ? customVariables['--border-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--border-radius', e.currentTarget.checked ? '0.4rem' : '0')}
					id={`${uid}--border-radius`}
				/>
				<span></span>
				<small>{m.theme_corners_hint()}</small>
			</div>

			<div>
				<label for={`${uid}--media-radius`}>{m.theme_artwork_label()}</label>
				<input
					type="checkbox"
					checked={customVariables['--media-radius'] ? customVariables['--media-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--media-radius', e.currentTarget.checked ? '0.4rem' : '0')}
					id={`${uid}--media-radius`}
				/>
				<span></span>
				<small>{m.theme_artwork_hint()}</small>
			</div>

			<div>
				<label for={`${uid}-hide-artwork`}>{m.theme_hide_artwork_label()}</label>
				<input type="checkbox" bind:checked={appState.hide_track_artwork} id={`${uid}-hide-artwork`} />
				<span></span>
				<small>{m.theme_hide_artwork_hint()}</small>
			</div>
		</form>
	</section>

	<section>
		<h2>{m.theme_create_heading()}</h2>
		{#each baseColors as variable, i (variable.name + i)}
			<div class:inactive={!isActiveVariable(variable)}>
				<label hidden for={`${uid}-${variable.name}`}>{variable.label()}</label>
				<InputColor
					label={variable.label()}
					value={getCurrentValue(variable)}
					onchange={(e) => updateVariable(variable.name, e.target.value)}
				/>
				<input
					hidden
					type="text"
					value={getCurrentValue(variable)}
					placeholder={m.theme_input_placeholder_hex()}
					onchange={(e) => updateVariable(variable.name, e.currentTarget.value)}
				/>
				<small>{variable.description()}</small>
			</div>
		{/each}

		{#each overrides as variable (variable.name)}
			<div class:inactive={!isActiveVariable(variable)}>
				<label hidden for={`${uid}-${variable.name}`}>{variable.label()}</label>
				<InputColor
					label={variable.label()}
					value={getCurrentValue(variable)}
					onchange={(e) => updateVariable(variable.name, e.target.value)}
					disabled={!getCurrentValue(variable)}
				/>
				<input
					hidden
					type="text"
					value={getCurrentValue(variable)}
					placeholder={m.theme_input_placeholder_inherit()}
					onchange={(e) => updateVariable(variable.name, e.currentTarget.value)}
				/>
				<small>{variable.description()}</small>
			</div>
		{/each}

		<button style="margin-top: 0.5rem" onclick={resetToDefaults}>{m.theme_reset_button()}</button>
	</section>

	<section>
		<h2>{m.theme_share_heading()}</h2>
		<div class="row">
			<input type="text" readonly value={exportString} class="export-input" />
			<button onclick={copyTheme}>{m.theme_copy_button()}</button>
		</div>
		<div class="row">
			<input type="text" bind:value={importText} placeholder={m.theme_import_placeholder()} class="import-input" />
			<button onclick={importTheme} type="button" disabled={!importText.trim()}>{m.theme_apply_button()}</button>
		</div>
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

<br />
<br />

<section class="SmallContainer">
	<h2>{m.theme_typography_heading()}</h2>
	<div class="variable-grid">
		{#each fontSizes as sizeVar (sizeVar)}
			<article style="--size: var({sizeVar})">
				<h3>{sizeVar}</h3>
				<p>{m.theme_sample_text()}</p>
			</article>
		{/each}
	</div>
</section>

<section class="SmallContainer">
	<h2>{m.theme_form_heading()}</h2>
	<form>
		<div>
			<label
				>{m.theme_form_name_label()}
				<input type="text" />
			</label>
		</div>
		<div>
			<label
				>{m.theme_form_age_label()}
				<input type="number" />
			</label>
		</div>
		<div>
			<button type="button">{m.common_cancel()}</button>
			<button type="submit">{m.common_submit()}</button>
		</div>
	</form>
</section>

<style>
	section {
		margin-bottom: 2rem;
	}

	h2 {
		margin-bottom: 0.5rem;
	}

	input[type='text'] {
		width: 10rem;
	}

	form {
		display: flex;
		flex-flow: column;
		gap: 0.5rem;
		align-items: flex-start;

		label {
			user-select: none;
		}

		> div {
			display: grid;
			grid-template-columns: auto auto 1fr;
			gap: 0 0.5rem;
			align-items: center;
		}

		small {
			grid-column: 1 / -1;
		}
	}

	.inactive {
		display: none;
	}

	.variable-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(60ch, 1fr));

		h3 {
			border-left: calc(var(--size) * 2) solid;
			padding-left: 0.5rem;
		}

		p {
			font-size: var(--size);
			padding: 0.5rem;
			border-left: 1px solid;
		}
	}
</style>
