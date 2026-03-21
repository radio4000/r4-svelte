<script>
	import {appState} from '$lib/app-state.svelte'
	import {resolve} from '$app/paths'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.settings_player()} — {m.settings_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.settings_player()}</h1>
	</header>

	<section class="box">
		<form class="form">
			<fieldset>
				<legend>{m.settings_player_new_deck_volume()}</legend>
				<label>
					<input type="radio" bind:group={appState.default_new_deck_volume} value={0} />
					{m.settings_player_volume_silent()}
				</label>
				<label>
					<input type="radio" bind:group={appState.default_new_deck_volume} value={1} />
					{m.settings_player_volume_full()}
				</label>
			</fieldset>

			<fieldset>
				<legend>{m.settings_player_autoplay()}</legend>
				<label>
					<input type="checkbox" bind:checked={appState.autoplay_new_deck} />
					{m.settings_player_autoplay_description()}
				</label>
			</fieldset>

			<fieldset>
				<legend>{m.settings_player_speed_control()}</legend>
				<label>
					<input type="checkbox" bind:checked={appState.show_speed_control} />
					{m.settings_player_speed_control_description()}
				</label>
			</fieldset>

			<fieldset>
				<legend>{m.settings_player_track_range()}</legend>
				<label>
					<input type="checkbox" bind:checked={appState.show_track_range_control} />
					{m.settings_player_track_range_description()}
				</label>
			</fieldset>
		</form>
	</section>
</article>

<style>
	.box {
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		padding: 0.75rem;
	}

	.form {
		gap: 1rem;
	}

	legend {
		font-size: 1rem;
	}
</style>
