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
		padding: 0.1em 0.35em;
		border-radius: 999px;
		border: none;
		text-decoration: none;
		font: inherit;
		color: inherit;
		background: var(--gray-3);
		box-shadow: 0 0 0 1px transparent;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 0.15s,
			box-shadow 0.15s;
	}

	a:hover,
	button:hover {
		background: var(--gray-2);
		box-shadow: 0 0 0 1px var(--gray-6);
		text-decoration: underline;
	}

	a:active,
	button:active {
		background: var(--gray-4);
		box-shadow: 0 0 0 1px var(--gray-7);
		text-decoration: underline;
	}
</style>
