<script>
	// Mounts queryView for views.svelte.test.ts: queryView's createQuery reads the
	// QueryClient from component context, which a bare $effect.root doesn't have.
	import {setQueryClientContext} from '@tanstack/svelte-query'
	import {queryClient} from '#lib/collections/query-client.js'
	import {queryView} from '#lib/views.svelte.js'

	/** @type {{getView: () => import('#lib/views.js').View, expose: (v: ReturnType<typeof queryView>) => void}} */
	const {getView, expose} = $props()
	setQueryClientContext(queryClient)
	// Mounted once per test, and getView is itself reactive: reading both once is the point
	// svelte-ignore state_referenced_locally
	expose(queryView(getView))
</script>
