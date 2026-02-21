<script>
	import {appState} from '$lib/app-state.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>Player — {m.settings_title()}</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; {m.nav_settings()}</a>

	<h1>Player</h1>

	<form class="form">
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

		<fieldset>
			<legend>Speed control</legend>
			<label>
				<input type="checkbox" bind:checked={appState.show_speed_control} />
				Show playback speed slider in deck transport
			</label>
		</fieldset>

		<fieldset>
			<legend>Track range</legend>
			<label>
				<input type="checkbox" bind:checked={appState.show_track_range_control} />
				Show track progress bar in deck transport
			</label>
		</fieldset>
	</form>
</article>

<style>
	h1 {
		margin-block: 1rem;
	}

	.form {
		gap: 1rem;
	}

	legend {
		font-size: 1rem;
	}
</style>
