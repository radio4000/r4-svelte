<script>
	import KeyboardEditor from '$lib/components/keyboard-editor.svelte'
	import {resolve} from '$app/paths'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.page_title_keyboard()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.page_title_keyboard()}</h1>
	</header>
	<KeyboardEditor />
</article>
