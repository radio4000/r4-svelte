<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {resolve} from '$app/paths'
	import {appName} from '#lib/config.js'
	import BackLink from '#lib/components/back-link.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import {repoCodeSearchUrl, repoUrl, supportsCodeSearch} from '#lib/repo.js'

	const analyticsImportSearchUrl = repoCodeSearchUrl('"#lib/analytics.js" path:src')
	const analyticsCaptureSearchUrl = repoCodeSearchUrl('"capture(" path:src')
</script>

<Seo title={`${m.settings_analytics_title()} — ${m.settings_title()}`} plain />

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
		background: var(--color-interface-elevated);
		border: 1px solid var(--color-interface-border);
		border-radius: var(--border-radius);
		padding: 0.75rem;
		box-shadow: var(--shadow-modal);
	}
</style>
