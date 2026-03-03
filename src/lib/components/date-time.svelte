<script>
	import {appState} from '$lib/app-state.svelte'
	import {formatTime, toIsoDateTime, isValidDateInput} from '$lib/dates.js'
	import {getLocale} from '$lib/paraglide/runtime'

	/** @type {{date: Date | string | number | null | undefined, locale?: string | string[]}} */
	let {date, locale} = $props()

	const resolvedLocale = $derived(locale || appState.language || getLocale())
	const formatted = $derived(formatTime(date, resolvedLocale))
	const datetime = $derived(toIsoDateTime(date))
	const valid = $derived(isValidDateInput(date))
</script>

{#if valid}
	<time {datetime}>{formatted}</time>
{/if}
