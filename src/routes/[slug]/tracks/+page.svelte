<script lang="ts">
	import {page} from '$app/state'
	import {goto} from '$app/navigation'
	import {onMount} from 'svelte'
	import * as m from '$lib/paraglide/messages'

	const slug = $derived(page.params.slug)

	onMount(() => {
		goto(`/${slug}`, {replaceState: true})
	})
</script>

<p>{m.common_loading()}</p>
