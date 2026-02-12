<script>
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>Player — {m.settings_title()}</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; {m.nav_settings()}</a>

	<h2>Player</h2>

	<fieldset>
		<legend>New deck volume</legend>
		<label>
			<input type="radio" bind:group={appState.default_new_deck_volume} value={0} />
			Silent (0%)
		</label>
		<label>
			<input type="radio" bind:group={appState.default_new_deck_volume} value={1} />
			Full (100%)
		</label>
	</fieldset>

	<fieldset>
		<legend>Auto-play</legend>
		<label>
			<input type="checkbox" bind:checked={appState.autoplay_new_deck} />
			Auto-play track when opening a new deck
		</label>
	</fieldset>
</article>
