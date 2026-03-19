<script>
	import {getLocale, setLocale, locales} from '$lib/paraglide/runtime'
	import {appState} from '$lib/app-state.svelte'

	let selectedLocale = $state(appState.language ?? getLocale())
	const languageNames =
		typeof Intl !== 'undefined' && Intl.DisplayNames
			? new Intl.DisplayNames(['en'], {type: 'language', languageDisplay: 'standard'})
			: null

	// Update the selected locale when appState.language changes
	$effect(() => {
		if (appState.language && appState.language !== selectedLocale) {
			selectedLocale = appState.language
		}
	})

	async function handleChange(event) {
		const locale = event.currentTarget.value
		if (!locale || locale === selectedLocale) return

		// Set the locale using Paraglide without reloading
		await setLocale(locale, {reload: false})
		selectedLocale = locale

		// Persist in app state
		appState.language = locale
	}
</script>

<label class="language-select">
	<select bind:value={selectedLocale} onchange={handleChange} oninput={handleChange}>
		{#each locales as locale (locale)}
			<option value={locale}>
				{locale === selectedLocale ? '🌐' : ''}
				{languageNames?.of(locale) ? `${languageNames.of(locale)} (${locale})` : locale}
			</option>
		{/each}
	</select>
</label>

<style>
	.language-select {
		display: flex;
		width: 100%;
	}

	select {
		width: 100%;
		border-radius: var(--border-radius);
		border: 1px solid var(--gray-6);
		background: var(--gray-2);
		padding: 0.5rem;
		font-size: inherit;
	}
</style>
