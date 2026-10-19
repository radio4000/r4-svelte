<script>
	import KeyboardEditor from '#lib/components/keyboard-editor.svelte'
	import {resolve} from '$app/paths'
	import BackLink from '#lib/components/back-link.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'
</script>

<Seo title={m.page_title_keyboard()} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.page_title_keyboard()}</h1>
	</header>
	<KeyboardEditor />
</article>
