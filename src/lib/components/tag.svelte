<script>
	import {appState} from '$lib/app-state.svelte'
	import {page} from '$app/state'

	/** @type {{href?: string, onclick?: () => void, value?: string, children: import('svelte').Snippet}} */
	const {href, onclick, value, children} = $props()

	const splitRe = /\s+/

	const isPlaying = $derived(
		Boolean(
			value &&
			Object.values(appState.decks).some((d) =>
				d.playlist_title?.toLowerCase().split(splitRe).includes(value.toLowerCase())
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
	<a {href} class={{playing: isPlaying, filtered: isFiltered}}>{@render children()}</a>
{:else}
	<button type="button" {onclick} class={{playing: isPlaying, filtered: isFiltered}}
		>{@render children()}</button
	>
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
		font-stretch: 90%;
		color: var(--tag-color, inherit);
		background: var(--tag-bg, var(--gray-3));
		box-shadow: 0 0 0 1px var(--tag-border, transparent);
		white-space: nowrap;
		transition:
			background 0.15s,
			color 0.15s,
			box-shadow 0.15s;
	}

	button {
		cursor: var(--interactive-cursor, pointer);
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
		--tag-border: var(--gray-7);
		background: var(--tag-bg-hover, var(--gray-2));
		box-shadow: 0 0 0 1px var(--tag-border);
		text-decoration: none;
	}

	a:active,
	button:active {
		background: var(--tag-bg-active, var(--gray-4));
		box-shadow: 0 0 0 1px var(--gray-7);
		text-decoration: underline;
	}

	a.playing:hover,
	button.playing:hover {
		background: var(--accent-10);
		color: var(--gray-1);
		box-shadow: 0 0 0 1px var(--accent-11);
	}

	a.filtered:hover,
	button.filtered:hover {
		background: var(--accent-4);
		color: var(--accent-11);
		box-shadow: 0 0 0 1px var(--accent-9);
	}
</style>
