<script>
	import {viewIconMap, viewLabelMap} from './channels-view-shared.js'
	import PopoverMenu from './popover-menu.svelte'
	import SortControls from './sort-controls.svelte'
	import Icon from './icon.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {{display?: 'grid' | 'list' | 'map' | 'tuner' | 'infinite', order?: string, direction?: 'asc' | 'desc', setDisplay?: (value: 'grid' | 'list' | 'map' | 'tuner' | 'infinite') => void, showSort?: boolean, onreshuffle?: () => void}} */
	let {
		display = $bindable('grid'),
		order = $bindable('updated'),
		direction = $bindable('desc'),
		setDisplay = (/** @type {'grid' | 'list' | 'map' | 'tuner' | 'infinite'} */ value) => {
			display = value
		},
		showSort = true,
		onreshuffle = undefined
	} = $props()
</script>

<PopoverMenu
	id="channels-view"
	closeOnClick={false}
	triggerAttachment={tooltip({content: m.channels_view_mode({mode: viewLabelMap[display]()})})}
>
	{#snippet trigger()}<Icon icon={viewIconMap[display]} strokeWidth={1.7} />
		{viewLabelMap[display]()}{/snippet}
	<menu class="view-modes">
		<button
			class:active={display === 'grid'}
			onclick={() => setDisplay('grid')}
			{@attach tooltip({content: m.channels_tooltip_grid()})}
		>
			<Icon icon="grid" strokeWidth={1.7} /><small>{m.channels_view_label_grid()}</small>
		</button>
		<button
			class:active={display === 'list'}
			onclick={() => setDisplay('list')}
			{@attach tooltip({content: m.channels_tooltip_list()})}
		>
			<Icon icon="unordered-list" /><small>{m.channels_view_label_list()}</small>
		</button>
		<button
			class:active={display === 'map'}
			onclick={() => setDisplay('map')}
			{@attach tooltip({content: m.channels_tooltip_map()})}
		>
			<Icon icon="map" strokeWidth={1.7} /><small>{m.channels_view_label_map()}</small>
		</button>
		<button
			class:active={display === 'tuner'}
			onclick={() => setDisplay('tuner')}
			{@attach tooltip({content: m.channels_tooltip_tuner()})}
		>
			<Icon icon="radio" /><small>{m.channels_view_label_tuner()}</small>
		</button>
		<button
			class:active={display === 'infinite'}
			onclick={() => setDisplay('infinite')}
			{@attach tooltip({content: m.channels_tooltip_infinite()})}
		>
			<Icon icon="box-3d" /><small>{m.channels_view_label_infinite()}</small>
		</button>
	</menu>
	{#if showSort}
		<SortControls bind:order bind:direction {onreshuffle} />
	{/if}
</PopoverMenu>
