<script>
	import {toggleTheme as toggleThemeApi} from '$lib/api'
	import {useAppState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	const {showLabel = true, ...rest} = $props()

	const appState = useAppState()

	const prefersLight = $derived(window.matchMedia('(prefers-color-scheme: light)').matches)
	const theme = $derived(appState?.theme ?? (prefersLight ? 'light' : 'dark'))
	const icon = $derived(theme === 'light' ? 'moon' : 'sun')
</script>

<button onclick={toggleThemeApi} {...rest}>
	<Icon {icon} size={20} />
	<span hidden={!showLabel}>{theme}</span>
</button>
