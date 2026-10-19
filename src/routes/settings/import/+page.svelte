<script>
	import {appState} from '#lib/app-state.svelte.js'
	import {resolve} from '$app/paths'
	import BackLink from '#lib/components/back-link.svelte'
	import Icon from '#lib/components/icon.svelte'
	import Seo from '#lib/components/seo.svelte'
	import * as m from '#lib/paraglide/messages.js'

	const importedCount = $derived(appState.local_channels?.length ?? 0)
</script>

<Seo title={m.import_title()} plain />

<article class="focused constrained">
	<header>
		<BackLink href={resolve('/settings')} />
		<h1>{m.import_title()}</h1>
	</header>

	<p>{m.local_import_note()}</p>

	{#if importedCount}
		<p>
			<a href={resolve('/') + '?filter=imported'}
				>{m.import_previously_imported({count: importedCount})}</a
			>
		</p>
	{/if}

	<menu class="nav-vertical">
		<a href={resolve('/settings/import/backup')}>
			<Icon icon="document-download" />
			{m.import_backup_label()}
		</a>
		<a href={resolve('/settings/import/folder')}>
			<Icon icon="document" />
			{m.import_folder_label()}
		</a>
		<a href={resolve('/settings/import/m3u')}>
			<Icon icon="unordered-list" />
			{m.import_m3u_label()}
		</a>
	</menu>
</article>
