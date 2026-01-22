<script>
	import {useLiveQuery} from '@tanstack/svelte-db'
	import {demoCollection} from './demo-state.svelte'

	const query = useLiveQuery((/** @type {any} */ q) =>
		q.from({todos: demoCollection}).select((/** @type {any} */ t) => t.todos)
	)
</script>

<pre>useLiveQuery: {query.status} ({query.data.length} items)</pre>

{#if query.data.length > 0}
	<p>Live query bridges cache → collection. Data updates reactively.</p>
	<slot />
{/if}
