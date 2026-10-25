<script>
	/**
	 * NavPopover — brand trigger opening a command-palette style panel:
	 * global actions, jump-to-channel search, channel shortlists (keyboard
	 * navigable via listbox-nav). Also opens via cmd/ctrl+K → appState.modal_nav.
	 */
	import {resolve} from '$app/paths'
	import {appState} from '#lib/app-state.svelte.js'
	import PopoverMenu from '#lib/components/popover-menu.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import Icon from '#lib/components/icon.svelte'
	import IconR4 from '#lib/components/icon-r4.svelte'
	import ChannelAvatar from '#lib/components/channel-avatar.svelte'
	import Tag from '#lib/components/tag.svelte'
	import {listboxNav} from '#lib/components/listbox-nav.svelte.js'
	import {getFollowedChannels} from '#lib/followed-channels.svelte.js'
	import {getFeaturedSuggestions} from '#lib/featured-suggestions.svelte.js'
	import {searchChannelsCombined} from '#lib/search.js'
	import {appName, conceptIcons} from '#lib/config.js'
	import * as m from '#lib/paraglide/messages.js'

	const uid = $props.id()

	const userChannel = $derived(appState.channel)
	const ownChannels = $derived(userChannel ? [userChannel] : [])

	const followed = getFollowedChannels()
	const recentChannels = $derived(followed.followedChannels.slice(0, 3))
	const followingHref = $derived(
		userChannel
			? resolve('/[slug]/following', {slug: userChannel.slug})
			: resolve('channels/favorites')
	)

	const suggestions = getFeaturedSuggestions()
	const featuredChannels = $derived(suggestions.pool.slice(0, 6))
	const showFeatured = $derived(
		!ownChannels.length && !recentChannels.length && featuredChannels.length > 0
	)
	const tags = $derived(suggestions.tags.slice(0, 8))

	let query = $state('')
	let results = $state(/** @type {import('#lib/types.js').Channel[]} */ ([]))
	let searching = $state(false)

	let noQueryListboxEl = $state()
	let resultsListboxEl = $state()
	let menuEl = $state()

	$effect(() => {
		if (appState.modal_nav) {
			menuEl?.open()
			appState.modal_nav = false
		}
	})

	// Channel jump-search (slug + FTS + local fuzzy)
	$effect(() => {
		const q = query.trim()
		if (!q) {
			results = []
			searching = false
			return
		}
		searching = true
		let stale = false
		searchChannelsCombined({query: q, localChannels: appState.local_channels ?? []})
			.then(({channels}) => {
				if (stale) return
				results = channels.slice(0, 12)
				searching = false
			})
			.catch(() => {
				if (stale) return
				results = []
				searching = false
			})
		return () => {
			stale = true
		}
	})

	function handleSearchKeydown(/** @type {KeyboardEvent} */ e) {
		if (e.key === 'ArrowDown') {
			const target = query.trim() ? resultsListboxEl : noQueryListboxEl
			if (!target) return
			e.preventDefault()
			target.focus()
		} else if (e.key === 'Enter' && query.trim()) {
			const first = resultsListboxEl?.querySelector('[role="option"]')
			if (!first) return
			e.preventDefault()
			first.click()
		}
	}
</script>

<PopoverMenu align="left" valign="bottom" btnClass="btn nav-btn brand-btn" bind:this={menuEl}>
	{#snippet trigger()}
		<IconR4 size={18} />
		<span class="btn-label">{appName}</span>
	{/snippet}

	<div class="nav-palette">
		<div class="palette-scroll">
			<!-- stopPropagation so the input's clear button doesn't close the popover -->
			<div class="palette-search" role="search" onclick={(e) => e.stopPropagation()}>
				<SearchInput
					bind:value={query}
					debounce={200}
					placeholder={m.search_jump_placeholder()}
					onkeydown={handleSearchKeydown}
					autofocus
				/>
			</div>

			<div class="palette-tiles">
				<a class="tile" href={resolve('/')}>
					<Icon icon={conceptIcons.home} />
					<span>{m.nav_home()}</span>
				</a>
				<a class="tile" href={resolve('/explore')}>
					<Icon icon={conceptIcons.channels} />
					<span>{m.nav_explore()}</span>
				</a>
				<a class="tile" href={resolve('channels/all') + '?display=map'}>
					<Icon icon={conceptIcons.map} />
					<span>{m.nav_map()}</span>
				</a>
			</div>

			{#if !query.trim() && tags.length}
				<section class="palette-list">
					<h4>{m.nav_top_tags()}</h4>
					<div class="row tags">
						{#each tags as tag (tag)}
							<Tag href={resolve('/search/tracks') + '?q=' + encodeURIComponent('#' + tag)}
								>#{tag}</Tag
							>
						{/each}
					</div>
				</section>
			{/if}

			{#if query.trim()}
				<section class="palette-list">
					<h4>{m.nav_channels()}</h4>
					{#if searching && !results.length}
						<p class="palette-hint">{m.search_loading_channels()}</p>
					{:else if results.length}
						<div
							class="channel-listbox"
							role="listbox"
							tabindex="0"
							aria-label={m.nav_channels()}
							bind:this={resultsListboxEl}
							{@attach listboxNav({wrap: true, onSelect: (_, el) => el.click()})}
						>
							{#each results as channel (channel.id)}
								{@render channelRow(channel, `${uid}-result-${channel.id}`)}
							{/each}
						</div>
					{:else}
						<p class="palette-hint">{m.search_no_results()} “{query.trim()}”</p>
					{/if}
				</section>
			{:else if ownChannels.length || recentChannels.length || showFeatured}
				<div
					class="palette-groups"
					role="listbox"
					tabindex="0"
					aria-label={m.nav_channels()}
					bind:this={noQueryListboxEl}
					{@attach listboxNav({wrap: true, onSelect: (_, el) => el.click()})}
				>
					{#if ownChannels.length}
						<section class="palette-list">
							<h4>{m.nav_your_channels()}</h4>
							{#each ownChannels as channel (channel.id)}
								{@render channelRow(channel, `${uid}-own-${channel.id}`)}
							{/each}
						</section>
					{/if}
					{#if recentChannels.length}
						<section class="palette-list">
							<h4>{m.nav_following()}</h4>
							{#each recentChannels as channel (channel.id)}
								{@render channelRow(channel, `${uid}-recent-${channel.id}`)}
							{/each}
							<a
								class="list-link"
								href={followingHref}
								role="option"
								tabindex="-1"
								aria-selected="false"
								id={`${uid}-following-all`}
							>
								<Icon icon={conceptIcons.following} size={15} />
								<span>{m.nav_all_following()}</span>
							</a>
						</section>
					{/if}
					{#if showFeatured}
						<section class="palette-list">
							<h4>{m.channels_filter_option_featured()}</h4>
							{#each featuredChannels as channel (channel.id)}
								{@render channelRow(channel, `${uid}-featured-${channel.id}`)}
							{/each}
						</section>
					{/if}
				</div>
			{/if}
		</div>

		<footer class="palette-footer">
			<nav class="nav-vertical">
				<a href={resolve('/settings')}>
					<Icon icon="settings" size={16} />
					<span>{m.nav_settings()}</span>
				</a>
			</nav>
		</footer>
	</div>
</PopoverMenu>

{#snippet channelRow(channel, rowId)}
	<a
		class="channel-row"
		href={resolve('/[slug]', {slug: channel.slug})}
		role="option"
		tabindex="-1"
		aria-selected="false"
		id={rowId}
	>
		<ChannelAvatar id={channel.image} alt={channel.name} />
		<span class="channel-meta">
			<span class="channel-name">{channel.name}</span>
			<span class="channel-slug">@{channel.slug}</span>
		</span>
	</a>
{/snippet}

<style>
	:global(.home-link) {
		display: flex;
		place-items: center;
	}
	.nav-palette {
		display: flex;
		flex-direction: column;
		width: min(22rem, calc(100vw - 1.5rem));
		max-height: min(38rem, calc(100vh - 5rem));
		overflow: hidden;
	}

	.palette-scroll {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.palette-tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-1);
	}

	.tile {
		background: var(--gray-3);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		border-radius: var(--border-radius);
		min-height: 3rem;
		font-size: var(--font-2);
		padding: var(--space-2) var(--space-1);
		text-decoration: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.tile:hover {
			background: var(--gray-5);
			border-color: var(--accent-6);
			text-decoration: none;
		}
	}

	.tile :global(svg) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.tags {
		padding-inline: var(--space-1);
	}

	.palette-groups {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.palette-list,
	.channel-listbox {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.palette-list h4 {
		margin: 0 0 var(--space-1);
		padding-inline: var(--space-1);
		font-size: var(--font-1);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--gray-10);
	}

	.palette-hint {
		margin: 0;
		padding: var(--space-1);
		color: var(--gray-10);
		font-size: var(--font-2);
	}

	.channel-row,
	.list-link {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-radius: var(--border-radius);
		color: inherit;
		text-decoration: none;
	}

	.channel-row:global([aria-selected='true']) {
		background: var(--gray-5);
		text-decoration: none;
	}

	@media (hover: hover) and (pointer: fine) {
		.channel-row:hover,
		.list-link:hover {
			background: var(--gray-5);
			text-decoration: none;
		}
	}

	.list-link {
		margin-top: var(--space-1);
		font-size: var(--font-2);
		color: var(--accent-10);
	}

	.channel-row :global(img),
	.channel-row :global(.fallback) {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--border-radius);
		object-fit: cover;
		flex: none;
	}

	.channel-meta {
		display: flex;
		flex-direction: column;
		gap: 0;
		line-height: 1.2;
		min-width: 0;
	}

	.channel-name {
		font-size: var(--font-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.channel-slug {
		font-size: var(--font-1);
		color: var(--gray-10);
	}

	.palette-footer {
		flex-shrink: 0;
		margin-top: var(--space-2);
		border-top: 1px solid var(--color-interface-border);
		padding-top: var(--space-1);
		background: var(--color-interface-elevated);
	}
</style>
