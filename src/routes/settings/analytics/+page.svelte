<script>
	import {appState} from '$lib/app-state.svelte'
	import BackLink from '$lib/components/back-link.svelte'
</script>

<svelte:head>
	<title>Analytics — Settings</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings" />
		<h1>Analytics</h1>
	</header>

	<p>
		You can OPTIONALLY send anonymous events to help the Radio4000 developers understand what's going on. No personal
		data is collected.
	</p>

	<section class="box">
		<form class="form">
			<fieldset>
				<label>
					<input type="checkbox" name="analytics_opt_in" bind:checked={appState.analytics_opt_in} />
					Share usage data
				</label>
			</fieldset>
		</form>
	</section>
	<p>
		Radio4000 by default does not track any usage. We have very little knowledge of how people (we don't know) use the
		app.
	</p>
</article>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}
	h1 {
		margin: 0;
	}
	.box {
		margin: 1rem 0;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		padding: 0.75rem;
	}
</style>
