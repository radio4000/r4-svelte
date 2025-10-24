<script>
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import {applyCustomCssVariables} from '$lib/apply-css-variables'
	import InputColor from '$lib/components/input-color.svelte'
	import InputRange from '$lib/components/input-range.svelte'
	import ThemeToggle from '$lib/components/theme-toggle.svelte'

	const appState = $derived(useAppState().data)

	const uid = $props.id()

	const fontSizes = ['--font-1', '--font-2', '--font-3', '--font-4', '--font-5', '--font-6', '--font-7', '--font-8']

	const baseColors = [
		{
			name: '--accent-light',
			label: 'accent (light)',
			description: 'generates accent-1 through accent-12',
			default: 'oklch(0.5 0.25 290)',
			theme: 'light'
		},
		{
			name: '--accent-dark',
			label: 'accent (dark)',
			description: 'generates accent-1 through accent-12',
			default: 'lch(86 48 124)',
			theme: 'dark'
		},
		{
			name: '--gray-light',
			label: 'gray tones',
			description: 'generates gray-1 through gray-12',
			default: 'oklch(0.67 0.01 0)',
			theme: 'light'
		},
		{
			name: '--gray-dark',
			label: 'gray tones',
			description: 'generates gray-1 through gray-12',
			default: 'oklch(0.67 0.01 0)',
			theme: 'dark'
		}
	]

	const overrides = [
		{
			name: '--button-bg-light',
			label: 'button bg (light)',
			description: 'override button background',
			default: '#fff',
			theme: 'light'
		},
		{
			name: '--button-bg-dark',
			label: 'button bg (dark)',
			description: 'override button background',
			default: '#000',
			theme: 'dark'
		},
		{
			name: '--button-color-light',
			label: 'button text (light)',
			description: 'override button text color',
			default: '#000',
			theme: 'light'
		},
		{
			name: '--button-color-dark',
			label: 'button text (dark)',
			description: 'override button text color',
			default: '#fff',
			theme: 'dark'
		}
	]

	let debounceTimer = $state()
	let applyTimer = $state()

	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const currentTheme = $derived(appState?.theme ?? (prefersLight ? 'light' : 'dark'))

	const isActiveVariable = (variable) => {
		// if (variable.theme === 'both') return true
		if (!currentTheme) return variable
		return variable.theme === currentTheme
	}

	const customVariables = $derived(appState?.custom_css_variables || {})
	const getCurrentValue = (variable) => customVariables[variable.name] || variable.default

	const updateVariable = (name, value) => {
		// Debounce both CSS application and database persistence
		clearTimeout(applyTimer)
		clearTimeout(debounceTimer)

		applyTimer = setTimeout(() => {
			applyCustomCssVariables({...customVariables, [name]: value.trim()})
		}, 50)

		debounceTimer = setTimeout(() => {
			appStateCollection.update(1, (draft) => {
				if (value.trim()) {
					draft.custom_css_variables[name] = value.trim()
				} else {
					delete draft.custom_css_variables[name]
				}
			})
		}, 300)
	}
	const resetToDefaults = () => {
		appStateCollection.update(1, (draft) => {
			draft.custom_css_variables = {}
		})
		applyCustomCssVariables({})
	}

	let importText = $state('')
	let exportString = $derived.by(() => {
		const variables = appState?.custom_css_variables || {}
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

			appStateCollection.update(1, (draft) => {
				draft.custom_css_variables = {...draft.custom_css_variables, ...variables}
			})
			applyCustomCssVariables({...appState?.custom_css_variables, ...variables})
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
		<h1>Appearance</h1>
		<ThemeToggle />
	</section>

	<section>
		<h2>Layout</h2>
		<form>
			<div>
				<label for={`${uid}--scaling`}>scale</label>
				<InputRange
					value={customVariables['--scaling'] || 1}
					min={0.9}
					max={1.1}
					step={0.05}
					id={`${uid}--scaling`}
					oninput={(e) => {
						updateVariable('--scaling', e.target.value)
					}}
				/>
				<span>{customVariables['--scaling'] || '1'}</span>
				<small>scale the interface to your measure</small>
			</div>

			<div>
				<label for={`${uid}--border-radius`}>rounded corners</label>
				<input
					type="checkbox"
					checked={customVariables['--border-radius'] ? customVariables['--border-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--border-radius', e.target.checked ? '0.4rem' : '0')}
					id={`${uid}--border-radius`}
				/>
				<span></span>
				<small>Round, round, around we go</small>
			</div>

			<div>
				<label for={`${uid}--media-radius`}>rounded artwork</label>
				<input
					type="checkbox"
					checked={customVariables['--media-radius'] ? customVariables['--media-radius'] !== '0' : true}
					onchange={(e) => updateVariable('--media-radius', e.target.checked ? '0.4rem' : '0')}
					id={`${uid}--media-radius`}
				/>
				<span></span>
				<small>Round corners on track artwork</small>
			</div>

			<div>
				<label for={`${uid}-hide-artwork`}>hide track artwork</label>
				<input
					type="checkbox"
					checked={appState?.hide_track_artwork}
					onchange={(e) =>
						appStateCollection.update(1, (draft) => {
							draft.hide_track_artwork = e.target.checked
						})}
					id={`${uid}-hide-artwork`}
				/>
				<span></span>
				<small>Toggle track thumbnails in track lists and player</small>
			</div>
		</form>
	</section>

	<section>
		<h2>Create your own theme</h2>
		{#each baseColors as variable, i (variable.name + i)}
			<div class:inactive={!isActiveVariable(variable)}>
				<label hidden for={`${uid}-${variable.name}`}>{variable.label}</label>
				<InputColor
					label={variable.label}
					value={getCurrentValue(variable)}
					onchange={(e) => updateVariable(variable.name, e.target.value)}
				/>
				<input
					hidden
					type="text"
					value={getCurrentValue(variable)}
					placeholder="e.g. #ff6b6b"
					onchange={(e) => updateVariable(variable.name, e.target.value)}
				/>
				<small>{variable.description}</small>
			</div>
		{/each}

		{#each overrides as variable (variable.name)}
			<div class:inactive={!isActiveVariable(variable)}>
				<label hidden for={`${uid}-${variable.name}`}>{variable.label}</label>
				<InputColor
					label={variable.label}
					value={getCurrentValue(variable)}
					onchange={(e) => updateVariable(variable.name, e.target.value)}
					disabled={!getCurrentValue(variable)}
				/>
				<input
					hidden
					type="text"
					value={getCurrentValue(variable)}
					placeholder="inherit"
					onchange={(e) => updateVariable(variable.name, e.target.value)}
				/>
				<small>{variable.description}</small>
			</div>
		{/each}

		<button style="margin-top: 0.5rem" onclick={resetToDefaults}>Reset layout and theme to defaults</button>
	</section>

	<section>
		<h2>Share theme</h2>
		<div class="row">
			<input type="text" readonly value={exportString} class="export-input" />
			<button onclick={copyTheme}>Copy theme</button>
		</div>
		<div class="row">
			<input type="text" bind:value={importText} placeholder="Paste theme string to import" class="import-input" />
			<button onclick={importTheme} type="button" disabled={!importText.trim()}>Apply theme</button>
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
	<h2>Typo(graphy)</h2>
	<div class="variable-grid">
		{#each fontSizes as sizeVar (sizeVar)}
			<article style="--size: var({sizeVar})">
				<h3>{sizeVar}</h3>
				<p>
					Sample text. The man writes like he's permanently high on incense and good intentions. Every sentence floats
					along with this oiled mystical confidence, as if he's personally received a download from the cosmos and is
					graciously sharing the password with the rest of us mortals. "Your children are not your children"—well,
					thanks Khalil.
				</p>
			</article>
		{/each}
	</div>
</section>

<section class="SmallContainer">
	<h2>A form</h2>
	<form>
		<div>
			<label
				>Your name
				<input type="text" />
			</label>
		</div>
		<div>
			<label
				>Your age
				<input type="number" />
			</label>
		</div>
		<div>
			<button type="button">Cancel</button>
			<button type="submit">Submit</button>
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
