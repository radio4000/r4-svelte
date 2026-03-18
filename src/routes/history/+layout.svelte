<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
	let routeId = $derived(page.route.id)
</script>

<nav class="tabs constrained">
	<a href={resolve('/history')} class:active={routeId === '/history'}>
		<Icon icon="history" />
		{m.nav_history()}
	</a>
	<a href={resolve('/history/stats')} class:active={routeId === '/history/stats'}>
		<Icon icon="chart-scatter" />
		{m.nav_stats()}
	</a>
</nav>

{@render children()}

<style>
	.tabs {
		border-bottom: 1px solid var(--gray-5);
	}
</style>
