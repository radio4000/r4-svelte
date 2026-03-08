<script>
	import BackLink from '$lib/components/back-link.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'
</script>

<svelte:head>
	<title>Import</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings" />
		<h1>Import</h1>
	</header>

	<p>{m.local_import_note()}</p>

	<menu class="nav-vertical">
		<a href="/settings/import/backup">
			<Icon icon="document-download" />
			From backup file
		</a>
		<a href="/settings/import/folder">
			<Icon icon="folder" />
			From channel folder
		</a>
		<a href="/settings/import/m3u">
			<Icon icon="unordered-list" />
			From M3U playlist
		</a>
	</menu>
</article>

<style>
	menu {
		margin: 0;
	}
</style>
