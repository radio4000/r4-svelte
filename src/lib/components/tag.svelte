<script>
	import {appState} from '$lib/app-state.svelte'
	import {page} from '$app/state'

	/** @type {{href?: string, onclick?: () => void, value?: string, children: import('svelte').Snippet}} */
	const {href, onclick, value, children} = $props()

	const isPlaying = $derived(
		Boolean(
			value &&
				Object.values(appState.decks).some((d) =>
					d.playlist_title?.toLowerCase().split(/\s+/).includes(value.toLowerCase())
				)
		)
	)

	const isFiltered = $derived.by(() => {
		if (!value) return false
		const urlTags = page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []
		return urlTags.some((t) => `#${t.toLowerCase()}` === value.toLowerCase())
	})
</script>

{#if href}
	<a {href} class:playing={isPlaying} class:filtered={isFiltered}>{@render children()}</a>
{:else}
	<button type="button" {onclick} class:playing={isPlaying} class:filtered={isFiltered}>{@render children()}</button>
{/if}

<style>
	a,
	button {
		display: inline;
		vertical-align: baseline;
		padding: 0.0625em 0.25em;
		min-height: 0;
		min-width: 0;
		border-radius: calc(var(--border-radius) * 999);
		border: none;
		text-decoration: none;
		font: inherit;
		color: var(--tag-color, inherit);
		background: var(--tag-bg, var(--gray-3));
		box-shadow: 0 0 0 1px var(--tag-border, transparent);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s,
			box-shadow 0.15s;
	}

	a.playing,
	button.playing {
		background: var(--accent-9);
		color: var(--gray-1);
	}

	a.filtered {
		background: var(--accent-3);
		box-shadow: 0 0 0 1px var(--gray-12);
		color: var(--accent-11);
	}

	button.filtered {
		background: var(--accent-3);
		box-shadow: 0 0 0 1px var(--accent-9);
		color: var(--accent-11);
	}

	a:hover,
	button:hover {
		background: var(--tag-bg-hover, var(--gray-2));
		box-shadow: 0 0 0 1px var(--gray-6);
		text-decoration: underline;
	}

	a:active,
	button:active {
		background: var(--tag-bg-active, var(--gray-4));
		box-shadow: 0 0 0 1px var(--gray-7);
		text-decoration: underline;
	}
</style>
