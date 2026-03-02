<script>
	import DateFormal from '$lib/components/date-formal.svelte'
	import * as m from '$lib/paraglide/messages'

	const repoUrl = __REPO_URL__ || __GIT_INFO__.remoteUrl
	const sha = $derived(__GIT_INFO__.sha)
	const commitDate = $derived(__GIT_INFO__.date)

	/** @type {{link?: boolean}} */
	let {link = true} = $props()

	const commitHref = $derived(repoUrl && sha ? `${repoUrl}/commit/${sha}` : undefined)
</script>

{#if sha}
	<span class="app-build-info">
		{#if link && commitHref}
			<a href={commitHref} target="_blank" rel="noreferrer">{m.app_version({sha})}</a>
		{:else}
			<span>{m.app_version({sha})}</span>
		{/if}
		{#if commitDate}
			<DateFormal date={commitDate} />
		{/if}
	</span>
{/if}

<style>
	.app-build-info {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.app-build-info a {
		text-decoration: none;
		color: inherit;
	}

	.app-build-info a:hover {
		text-decoration: underline;
	}
</style>
