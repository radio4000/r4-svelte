<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import * as m from '$lib/paraglide/messages'

	let {slug, channel, trackCount = 0} = $props()

	let routeId = $derived(page.route.id)
</script>

<nav class="channel-section-menu tabs chip-tabs" aria-label="Channel navigation">
	<a href={resolve('/[slug]', {slug})} class="btn chip" class:active={routeId === '/[slug]'}>
		{m.home_tab_home()}
	</a>
	<a
		href={resolve('/[slug]/tracks', {slug})}
		class="btn chip"
		class:active={routeId?.startsWith('/[slug]/tracks')}
	>
		{m.nav_tracks()} ({trackCount})
	</a>
	<a
		href={resolve('/[slug]/tags', {slug})}
		class="btn chip"
		class:active={routeId?.startsWith('/[slug]/tags')}
	>
		{m.channel_tags_link()}
	</a>
	<a
		href={resolve('/[slug]/mentions', {slug})}
		class="btn chip"
		class:active={routeId?.startsWith('/[slug]/mentions')}
	>
		Mentions
	</a>
	<a
		href={resolve('/[slug]/following', {slug})}
		class="btn chip"
		class:active={routeId?.startsWith('/[slug]/following')}
	>
		{m.nav_following()}
	</a>
	<a
		href={resolve('/[slug]/followers', {slug})}
		class="btn chip"
		class:active={routeId?.startsWith('/[slug]/followers')}
	>
		{m.nav_followers()}
	</a>
	{#if channel?.longitude && channel?.latitude}
		<a
			href={resolve('/[slug]/map', {slug})}
			class="btn chip"
			class:active={routeId?.startsWith('/[slug]/map')}
		>
			{m.nav_map()}
		</a>
	{/if}
</nav>

<style>
	.channel-section-menu {
		display: flex;
		flex-wrap: nowrap;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
	}

	.channel-section-menu :global(.btn.chip) {
		flex: 0 0 auto;
	}
</style>
