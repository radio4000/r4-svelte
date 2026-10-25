<script>
	import {repoCommitUrl} from '#lib/repo.js'
	import * as m from '#lib/paraglide/messages.js'

	const sha = $derived(__GIT_INFO__.sha)
	const commitDate = $derived(__GIT_INFO__.date)

	/** @type {{link?: boolean}} */
	let {link = true} = $props()

	// Plain Date getters, not Intl: this shows on the loading screen, and the
	// first Intl formatter costs ~50ms of a cold load at 4x CPU.
	const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
	const commitLabel = $derived.by(() => {
		const d = new Date(commitDate)
		if (Number.isNaN(d.getTime())) return ''
		return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
	})

	const commitHref = $derived(repoCommitUrl(sha))
</script>

{#if sha}
	<span class="app-build-info">
		{#if link && commitHref}
			<a href={commitHref} target="_blank" rel="noreferrer">{m.app_version({sha})}</a>
		{:else}
			<span>{m.app_version({sha})}</span>
		{/if}
		{#if commitLabel}
			<time datetime={commitDate}>{commitLabel}</time>
		{/if}
	</span>
{/if}

<style>
	.app-build-info {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.app-build-info a {
		text-decoration: none;
		color: inherit;
	}

	@media (hover: hover) and (pointer: fine) {
		.app-build-info a:hover {
			text-decoration: underline;
		}
	}
</style>
