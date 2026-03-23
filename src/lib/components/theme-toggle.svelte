<script>
	import {toggleTheme as toggleThemeApi} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'

	const {showLabel = true, ...rest} = $props()

	const theme = $derived(appState.theme ?? 'system')
	const icon = $derived(theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'eye')
</script>

<button onclick={toggleThemeApi} {...rest}>
	<Icon {icon} />
	<span hidden={!showLabel}>{theme}</span>
</button>
