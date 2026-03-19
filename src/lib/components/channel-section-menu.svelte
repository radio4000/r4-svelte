<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import Icon from '$lib/components/icon.svelte'
	import * as m from '$lib/paraglide/messages'

	let {slug, channel, canEdit, isLocal, trackCount = 0} = $props()

	let routeId = $derived(page.route.id)

	const activeIcon = $derived.by(() => {
		if (routeId === '/[slug]') return 'circle-info'
		if (routeId?.startsWith('/[slug]/tracks')) return 'unordered-list'
		if (routeId?.startsWith('/[slug]/tags')) return 'hash'
		if (routeId?.startsWith('/[slug]/mentions')) return 'user'
		if (routeId?.startsWith('/[slug]/following')) return 'sparkles'
		if (routeId?.startsWith('/[slug]/followers')) return 'users'
		if (routeId?.startsWith('/[slug]/map')) return 'map'
		if (routeId?.startsWith('/[slug]/edit')) return 'settings'
		if (routeId?.startsWith('/[slug]/batch-edit')) return 'unordered-list'
		if (routeId?.startsWith('/[slug]/backup')) return 'document-download'
		if (routeId?.startsWith('/[slug]/delete')) return 'delete'
		return 'circle-info'
	})

	const activeLabel = $derived.by(() => {
		if (routeId === '/[slug]') return 'Info'
		if (routeId?.startsWith('/[slug]/tracks')) return m.nav_tracks()
		if (routeId?.startsWith('/[slug]/tags')) return m.channel_tags_link()
		if (routeId?.startsWith('/[slug]/mentions')) return 'Mentions'
		if (routeId?.startsWith('/[slug]/following')) return m.nav_following()
		if (routeId?.startsWith('/[slug]/followers')) return m.nav_followers()
		if (routeId?.startsWith('/[slug]/map')) return m.nav_map()
		if (routeId?.startsWith('/[slug]/edit')) return m.common_edit()
		if (routeId?.startsWith('/[slug]/batch-edit')) return m.batch_edit_nav_label()
		if (routeId?.startsWith('/[slug]/backup')) return 'Backup'
		if (routeId?.startsWith('/[slug]/delete')) return 'Delete'
		return 'Info'
	})
</script>

<PopoverMenu>
	{#snippet trigger()}
		<Icon icon={activeIcon} />
		{activeLabel}
	{/snippet}
	<menu class="nav-vertical">
		<a href={resolve('/[slug]', {slug})} class:active={routeId === '/[slug]'}>
			<Icon icon="circle-info" />
			Info
		</a>
		<a href={resolve('/[slug]/tracks', {slug})} class:active={routeId?.startsWith('/[slug]/tracks')}>
			<Icon icon="unordered-list" />
			{m.nav_tracks()} ({trackCount})
		</a>
		<a href={resolve('/[slug]/tags', {slug})} class:active={routeId?.startsWith('/[slug]/tags')}>
			<Icon icon="hash" />
			{m.channel_tags_link()}
		</a>
		<a href={resolve('/[slug]/mentions', {slug})} class:active={routeId?.startsWith('/[slug]/mentions')}>
			<Icon icon="user" />
			Mentions
		</a>
		<a href={resolve('/[slug]/following', {slug})} class:active={routeId?.startsWith('/[slug]/following')}>
			<Icon icon="sparkles" />
			{m.nav_following()}
		</a>
		<a href={resolve('/[slug]/followers', {slug})} class:active={routeId?.startsWith('/[slug]/followers')}>
			<Icon icon="users" />
			{m.nav_followers()}
		</a>
		{#if channel?.longitude && channel?.latitude}
			<a href={resolve('/[slug]/map', {slug})} class:active={routeId?.startsWith('/[slug]/map')}>
				<Icon icon="map" />
				{m.nav_map()}
			</a>
		{/if}
		{#if canEdit}
			<hr />
			<a href={resolve('/[slug]/edit', {slug})} class:active={routeId?.startsWith('/[slug]/edit')}>
				<Icon icon="settings" />
				{m.common_edit()}
			</a>
			<a href={resolve('/[slug]/batch-edit', {slug})} class:active={routeId?.startsWith('/[slug]/batch-edit')}>
				<Icon icon="unordered-list" />
				{m.batch_edit_nav_label()}
			</a>
			<a href={resolve('/[slug]/backup', {slug})} class:active={routeId?.startsWith('/[slug]/backup')}>
				<Icon icon="document-download" />
				Backup
			</a>
		{:else if isLocal}
			<hr />
			<a href={resolve('/[slug]/delete', {slug})} class:active={routeId?.startsWith('/[slug]/delete')}>
				<Icon icon="delete" />
				Delete
			</a>
		{/if}
	</menu>
</PopoverMenu>
