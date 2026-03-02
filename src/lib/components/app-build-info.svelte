<script>
	import * as m from '$lib/paraglide/messages'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {appPresence} from '$lib/presence.svelte'

	const repo = __REPO_URL__ || __GIT_INFO__.remoteUrl
	const sha = $derived(__GIT_INFO__.sha)
	const commitDate = $derived(__GIT_INFO__.date)

	/** @type {{showPresenceCount?: boolean, link?: boolean}} */
	let {showPresenceCount = false, link = true} = $props()

	const commitHref = $derived(repo && sha ? `${repo}/commit/${sha}` : undefined)
	const formattedCommitDate = $derived(commitDate ? new Date(commitDate).toLocaleString() : null)
</script>

{#if sha}
	<span class="app-build-info">
		{#if link && commitHref}
			<a href={commitHref} target="_blank" rel="noreferrer">{m.app_version({sha})}</a>
		{:else}
			<span>{m.app_version({sha})}</span>
		{/if}
		{#if formattedCommitDate}
			<time datetime={commitDate}>{formattedCommitDate}</time>
		{/if}
		{#if showPresenceCount}
			<span
				class="presence-total"
				aria-label={m.app_presence_count_tooltip()}
				{@attach tooltip({content: m.app_presence_count_tooltip()})}
			>
				({appPresence.count})
			</span>
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

	.presence-total {
		color: var(--gray-10);
	}
</style>
