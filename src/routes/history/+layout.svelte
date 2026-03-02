<script>
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {children} = $props()
	const pathname = $derived(page.url.pathname)
</script>

<div class="tabs constrained">
	<nav>
		<a href="/history" class:active={pathname === '/history'}>
			<Icon icon="history" />
			{m.nav_history()}
		</a>
		<a href="/history/stats" class:active={pathname === '/history/stats'}>
			<Icon icon="chart-scatter" />
			{m.nav_stats()}
		</a>
	</nav>
</div>

{@render children()}

<style>
	.tabs {
		border-bottom: 1px solid var(--gray-5);
	}
</style>
