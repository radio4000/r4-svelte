<script lang="ts">
	import type {Snippet} from 'svelte'

	// A channel page's search/filter bar. Pages render it themselves, first in their markup,
	// so it's in the server-rendered HTML and doesn't pop in after hydration. It sticks under
	// the channel header; the layout drops the header's bottom edge so the two read as one card.
	let {controls}: {controls?: Snippet} = $props()
</script>

{#if controls}
	<menu class="channel-nav">
		<menu class="channel-nav-controls">
			{@render controls()}
		</menu>
	</menu>
{/if}

<style>
	.channel-nav {
		position: sticky;
		top: var(--channel-sticky-height, 0);
		z-index: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		background: var(--gray-2);
		border-inline: 1px solid var(--color-interface-border);
		border-bottom: 1px solid var(--color-interface-border);
		border-radius: 0 0 var(--border-radius) var(--border-radius);
		padding: var(--space-1);
	}

	.channel-nav-controls {
		display: flex;
		min-width: 0;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
