import {shufflePlayChannel} from '$lib/api'
import {appState} from '$lib/app-state.svelte'
import * as m from '$lib/paraglide/messages'

/** Shared icon map for channel display mode switcher. */
export const viewIconMap = {
	grid: 'grid',
	list: 'unordered-list',
	map: 'map',
	tuner: 'radio',
	infinite: 'infinite'
}

/** Shared label map for channel display mode switcher. */
export const viewLabelMap = {
	grid: () => m.channels_view_label_grid(),
	list: () => m.channels_view_label_list(),
	map: () => m.channels_view_label_map(),
	tuner: () => m.channels_view_label_tuner(),
	infinite: () => m.channels_view_label_infinite()
}

/**
 * Select a channel card on single-click.
 * @param {{slug?: string, id?: string}} item
 * @param {(id: string) => void} setSelected
 */
export function handleCanvasClick(item, setSelected) {
	if (!item.slug || !item.id) return
	setSelected(item.id)
}

/**
 * Shuffle-play a channel on double-click.
 * @param {{slug?: string, id?: string}} item
 */
export function handleCanvasDoubleClick(item) {
	if (!item?.slug || !item?.id) return
	shufflePlayChannel(appState.active_deck_id, {id: item.id, slug: item.slug})
}
