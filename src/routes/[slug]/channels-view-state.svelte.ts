import {appState} from '#lib/app-state.svelte.js'

type Display = 'grid' | 'list' | 'map' | 'infinite'
type Order = 'updated' | 'created' | 'name' | 'tracks'
type Direction = 'asc' | 'desc'

const DISPLAY_VALUES: Display[] = ['grid', 'list', 'map', 'infinite']
const ORDER_VALUES: Order[] = ['updated', 'created', 'name', 'tracks']

/**
 * Display/order/direction state for a channels list (followers, following, ...),
 * persisted to appState like the main channels explore page. Shared by every
 * [slug]/followers* and [slug]/following* page.
 */
export function getChannelsViewState() {
	let display = $state<Display>(
		DISPLAY_VALUES.includes(appState.channels_display as Display)
			? (appState.channels_display as Display)
			: 'grid'
	)
	let order = $state<Order>(
		ORDER_VALUES.includes(appState.channels_order as Order)
			? (appState.channels_order as Order)
			: 'updated'
	)
	let direction = $state<Direction>(appState.channels_order_direction === 'asc' ? 'asc' : 'desc')

	$effect(() => {
		appState.channels_display = display
		appState.channels_order = order
		appState.channels_order_direction = direction
	})

	return {
		get display() {
			return display
		},
		set display(value: Display) {
			display = value
		},
		get order() {
			return order
		},
		set order(value: Order) {
			order = value
		},
		get direction() {
			return direction
		},
		set direction(value: Direction) {
			direction = value
		}
	}
}

/** Case-insensitive match against a channel's name or slug. */
export function matchesChannelQuery(c: {name?: string; slug?: string}, q: string) {
	return (
		!q ||
		Boolean(c.name?.toLowerCase().includes(q.toLowerCase())) ||
		Boolean(c.slug?.toLowerCase().includes(q.toLowerCase()))
	)
}
