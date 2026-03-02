<script>
	import * as m from '$lib/paraglide/messages'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {appPresence} from '$lib/presence.svelte'

	/** @type {{repo?: string, sha?: string, commitDate?: string, showPresenceCount?: boolean, link?: boolean}} */
	let {repo, sha, commitDate, showPresenceCount = false, link = true} = $props()

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
