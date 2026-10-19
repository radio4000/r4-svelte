<script>
	import * as m from '#lib/paraglide/messages.js'

	/**
	 * Listener-count badge. Dark number pill.
	 * `corner` floats it into the top-right of a positioned parent (icon-only buttons);
	 * default flows inline (after a text label or standalone).
	 * @type {{ count: number, corner?: boolean }}
	 */
	let {count, corner = false} = $props()
</script>

{#if count > 0}
	<span
		class={['presence-count', {corner}]}
		title={count === 1
			? m.presence_count_listener_one({count})
			: m.presence_count_listener_other({count})}>{count}</span
	>
{/if}

<style>
	.presence-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.1em;
		height: 1.1em;
		padding: 0 var(--space-1);
		font-size: var(--font-1);
		font-weight: 600;
		line-height: 1;
		color: var(--gray-1);
		background: var(--gray-12);
		border-radius: 1em;
		pointer-events: none;
	}

	.presence-count.corner {
		position: absolute;
		top: calc(-1 * var(--space-1));
		right: calc(-1 * var(--space-1));
		box-shadow: 0 0 0 1.5px var(--color-interface, var(--gray-1));
	}
</style>
