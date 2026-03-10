<script>
	import {appState} from '$lib/app-state.svelte'
	import BackLink from '$lib/components/back-link.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	const importedCount = $derived(appState.local_channel_ids?.length ?? 0)
</script>

<svelte:head>
	<title>{m.import_title()}</title>
</svelte:head>

<article class="focused constrained">
	<header>
		<BackLink href="/settings" />
		<h1>{m.import_title()}</h1>
	</header>

	<p>{m.local_import_note()}</p>

	{#if importedCount}
		<p><a href="/?filter=imported">{m.import_previously_imported({count: importedCount})}</a></p>
	{/if}

	<menu class="nav-vertical">
		<a href="/settings/import/backup">
			<Icon icon="document-download" />
			{m.import_backup_label()}
		</a>
		<a href="/settings/import/folder">
			<Icon icon="document" />
			{m.import_folder_label()}
		</a>
		<a href="/settings/import/m3u">
			<Icon icon="unordered-list" />
			{m.import_m3u_label()}
		</a>
	</menu>
</article>

