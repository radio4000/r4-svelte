<script>
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'
	import Icon from '$lib/components/icon.svelte'
	import BackLink from '$lib/components/back-link.svelte'
</script>

<svelte:head>
	<title>{m.settings_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/menu')} />
		<h1>{m.settings_title()}</h1>
	</header>

	<menu class="nav-vertical">
		<a href={resolve('/settings/appearance')}>
			<Icon icon="palette" />
			{m.settings_appearance()}
		</a>
		<a href={resolve('/settings/player')}>
			<Icon icon="tv" />
			{m.settings_player()}
		</a>
		<a href={resolve('/settings/keyboard')}>
			<Icon icon="keyboard" />
			{m.settings_keyboard()}
		</a>
		<a href={resolve('/settings/analytics')}>
			<Icon icon="eye" />
			Analytics
		</a>
		<a href={resolve('/settings/import')}>
			<Icon icon="document-download" />
			Import
		</a>
	</menu>
</article>

<style>
	menu {
		margin: 0 0 1rem;
	}

	menu:first-of-type {
		margin-bottom: 0;
	}
	menu a small {
		display: block;
	}
</style>
