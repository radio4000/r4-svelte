<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {page} from '$app/state'

	/** @type {{href?: string, onclick?: () => void, value?: string, playing?: boolean, filtered?: boolean, deckId?: number, children: import('svelte').Snippet}} */
	const {href, onclick, value, playing, filtered, deckId, children} = $props()

	const splitRe = /\s+/

	const matchesTitle = (title) =>
		Boolean(value && title?.toLowerCase().split(splitRe).includes(value.toLowerCase()))

	// A deck-scoped tag (rendered inside a specific deck's header/queue) only
	// reflects that deck's own theme — otherwise a tag playing in one open
	// deck would also light up the same tag shown in every other deck.
	const isPlaying = $derived(
		playing ??
			(deckId != null
				? matchesTitle(appState.decks[deckId]?.playlist_title)
				: Object.values(appState.decks).some((d) => matchesTitle(d.playlist_title)))
	)

	const isFiltered = $derived.by(() => {
		if (filtered !== undefined) return filtered
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
	/* One quiet default look everywhere, and exactly two ways to stand out —
	   text color for "playing" (matches the active-track-title treatment
	   elsewhere), a soft background tint for "filtered". They're separate
	   visual channels on purpose: a tag that's both playing and filtered
	   shows both cues at once instead of one state hiding the other, and
	   neither depends on a border/ring to read (works with "Show borders"
	   off, and in light/dark). */
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
		background: var(--tag-bg, var(--gray-2));
		white-space: nowrap;
		transition:
			background 0.15s,
			color 0.15s;
	}

	button {
		cursor: var(--interactive-cursor, pointer);
	}

	a.playing,
	button.playing {
		color: var(--accent-9);
		font-weight: 600;
	}

	a.filtered,
	button.filtered {
		background: var(--accent-3);
		color: var(--accent-11);
	}

	a:hover,
	button:hover {
		background: var(--tag-bg-hover, var(--gray-3));
		text-decoration: none;
	}

	a:active,
	button:active {
		background: var(--tag-bg-active, var(--gray-4));
		text-decoration: underline;
	}

	a.playing:hover,
	button.playing:hover {
		background: var(--tag-bg-hover, var(--gray-3));
	}

	a.filtered:hover,
	button.filtered:hover {
		background: var(--accent-4);
	}
</style>
