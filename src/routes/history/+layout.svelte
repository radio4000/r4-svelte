<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
</script>

<nav class="tabs constrained">
	<a href={resolve('/history')} class:active={page.route.id === '/history'}>
		<Icon icon="history" />
		{m.nav_history()}
	</a>
	<a href={resolve('/history/stats')} class:active={page.route.id === '/history/stats'}>
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
