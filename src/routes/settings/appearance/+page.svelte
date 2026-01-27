<script>
	import ThemeEditor from '$lib/components/theme-editor.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.settings_appearance_title()}</title>
</svelte:head>

<article class="constrained">
	<a href="/settings">&larr; {m.nav_settings()}</a>
</article>

<ThemeEditor />
