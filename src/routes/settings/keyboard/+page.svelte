<script>
	import KeyboardEditor from '$lib/components/keyboard-editor.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.page_title_keyboard()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<a href="/settings">&larr; {m.nav_settings()}</a>
	</header>
	<KeyboardEditor />
</article>

<style>
	header {
		margin-block-end: 1rem;
	}
</style>
