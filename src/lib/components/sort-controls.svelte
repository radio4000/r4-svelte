<script>
	import Icon from './icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	let {order = $bindable(), direction = $bindable(), onreshuffle = undefined} = $props()

	function toggleDirection() {
		direction = direction === 'asc' ? 'desc' : 'asc'
	}

	function handleOrderChange(e) {
		order = e.currentTarget.value
	}
</script>

<div class="sort-row">
	<select value={order} onchange={handleOrderChange}>
		<option value="shuffle">{m.channels_tooltip_shuffle()}</option>
		<option value="updated">{m.channels_order_updated()}</option>
		<option value="created">{m.channels_order_created()}</option>
		<option value="name">{m.channels_order_name()}</option>
		<option value="tracks">{m.channels_order_tracks()}</option>
	</select>
	{#if order === 'shuffle'}
		<button onclick={() => onreshuffle?.()} {@attach tooltip({content: m.channels_tooltip_shuffle()})}>
			<Icon icon="shuffle" />
		</button>
	{:else}
		<button
			onclick={toggleDirection}
			{@attach tooltip({
				content: direction === 'asc' ? m.channels_tooltip_sort_asc() : m.channels_tooltip_sort_desc()
			})}
		>
			<Icon icon={direction === 'asc' ? 'funnel-ascending' : 'funnel-descending'} strokeWidth={1.5} />
		</button>
	{/if}
</div>

<style>
	.sort-row {
		display: flex;
		gap: 0.25rem;
	}

	.sort-row select {
		flex: 1;
	}
</style>
