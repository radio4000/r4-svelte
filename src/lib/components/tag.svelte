<script>
	/** @type {{href?: string, onclick?: () => void, children: import('svelte').Snippet}} */
	const {href, onclick, children} = $props()
</script>

{#if href}
	<a {href}>{@render children()}</a>
{:else}
	<button type="button" {onclick}>{@render children()}</button>
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
