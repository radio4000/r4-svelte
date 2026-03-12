<script>
	import ThemeEditor from '$lib/components/theme-editor.svelte'
	import {resolve} from '$app/paths'
	import BackLink from '$lib/components/back-link.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>{m.settings_appearance_title()}</title>
</svelte:head>

<article>
	<header class="focused constrained">
		<BackLink href={resolve('/settings')} />
		<h1>{m.theme_heading()}</h1>
	</header>
	<main>
		<ThemeEditor />
	</main>
</article>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-block: 1rem;
	}
	h1 {
		margin: 0;
	}
</style>
