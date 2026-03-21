<script>
	import {appState} from '$lib/app-state.svelte'
	import {resolve} from '$app/paths'
	import {appName} from '$lib/config'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'
	import {repoCodeSearchUrl, repoUrl, supportsCodeSearch} from '$lib/repo'

	const analyticsImportSearchUrl = repoCodeSearchUrl('"$lib/analytics" path:src')
	const analyticsCaptureSearchUrl = repoCodeSearchUrl('"capture(" path:src')
</script>

<svelte:head>
	<title>{m.settings_analytics_title()} — {m.settings_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.settings_analytics_title()}</h1>
	</header>

	<p>
		{m.settings_analytics_intro({appName})}
	</p>

	<section class="box">
		<form class="form">
			<fieldset>
				<label>
					<input type="checkbox" name="analytics_opt_in" bind:checked={appState.analytics_opt_in} />
					{m.settings_analytics_share_usage()}
				</label>
			</fieldset>
		</form>
	</section>
	<p>
		{m.settings_analytics_outro({appName})}
	</p>

	{#if repoUrl}
		<p>{m.settings_analytics_code_refs_label()}</p>
		<ul>
			{#if supportsCodeSearch}
				<li>
					<a href={analyticsImportSearchUrl} target="_blank" rel="noreferrer">
						{m.settings_analytics_code_refs_imports()}
					</a>
				</li>
				<li>
					<a href={analyticsCaptureSearchUrl} target="_blank" rel="noreferrer">
						{m.settings_analytics_code_refs_events()}
					</a>
				</li>
			{:else}
				<li>
					<a href={repoUrl} target="_blank" rel="noreferrer"
						>{m.settings_analytics_code_refs_repo()}</a
					>
				</li>
			{/if}
		</ul>
	{/if}
</article>

<style>
	.box {
		margin: 1rem 0;
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		padding: 0.75rem;
	}
</style>
