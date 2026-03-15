<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '$lib/config'
	import {tracksCollection, fetchRecentTracks, fetchRecentTracksForSlugs} from '$lib/collections/tracks'
	import {channelsCollection, loadMoreChannels} from '$lib/collections/channels'
	import {featuredScore, getChannelTags} from '$lib/utils'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	const {data} = $props()

	const FEATURED_DAYS = 30
	const FEATURED_COUNT = 3
	const RECENT_LIMIT = 200

	let tracks = $state(/** @type {import('$lib/types').Track[]} */ ([]))
	let loaded = $state(false)
	let search = $state('')

	const filterParam = $derived(data.filter)
	const isChannelsTab = $derived(page.route.id?.startsWith('/explore/channels'))
	const isTracksTab = $derived(page.route.id?.startsWith('/explore/tracks'))
	const isTagsTab = $derived(page.route.id?.startsWith('/explore/tags'))

	const displayParam = $derived(page.url.searchParams.get('display') === 'cloud' ? 'cloud' : 'list')
	const sortParam = $derived(page.url.searchParams.get('sort') === 'alpha' ? 'alpha' : 'count')

	$effect(() => {
		const f = filterParam
		tracks = []
		loaded = false
		loadData(f)
	})

	async function loadData(filter) {
		try {
			if (filter === 'recent') {
				tracks = await fetchRecentTracks({limit: RECENT_LIMIT, offset: 0})
			} else {
				// featured channels' tracks
				await (channelsCollection.isReady() ? Promise.resolve() : channelsCollection.preload())
				await loadMoreChannels({
					trackCountGte: 10,
					imageNotNull: true,
					limit: 200,
					offset: 0,
					orderColumn: 'latest_track_at',
					ascending: false
				})
				const featuredSince = new Date(Date.now() - FEATURED_DAYS * 86400000).toISOString()
				const pool = [...channelsCollection.state.values()].filter(
					(ch) => (ch.track_count ?? 0) >= 10 && ch.image && ch.latest_track_at && ch.latest_track_at >= featuredSince
				)
				const picked = pool.toSorted((a, b) => featuredScore(b) - featuredScore(a)).slice(0, FEATURED_COUNT)
				if (picked.length) {
					await fetchRecentTracksForSlugs(
						picked.map((ch) => ch.slug),
						featuredSince
					)
				}
				const slugSet = new Set(picked.map((ch) => ch.slug))
				void tracksCollection.state.size
				tracks = [...tracksCollection.state.values()].filter((t) => t?.slug && slugSet.has(t.slug))
			}
			loaded = true
		} finally {
			loaded = true
		}
	}

	const allTags = $derived.by(() => {
		const raw = getChannelTags(tracks)
		if (sortParam === 'alpha') return raw.toSorted((a, b) => a.value.localeCompare(b.value))
		return raw // already count-sorted
	})

	const visibleTags = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return q ? allTags.filter((t) => t.value.includes(q)) : allTags
	})

	const maxCount = $derived(visibleTags.reduce((max, t) => Math.max(max, t.count), 1))

	function setDisplay(value) {
		const query = new URL(page.url).searchParams
		if (value === 'list') query.delete('display')
		else query.set('display', value)
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	function setSort(value) {
		const query = new URL(page.url).searchParams
		if (value === 'count') query.delete('sort')
		else query.set('sort', value)
		goto(`?${query.toString()}`, {replaceState: true, keepFocus: true})
	}

	/** @param {string} tag */
	function tagSearchHref(tag) {
		return resolve('/search') + `?q=${encodeURIComponent('#' + tag)}`
	}
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<div class="layout">
	<menu class="filtermenu">
		<a href={resolve('/explore/channels/featured')} class="btn" class:active={isChannelsTab}>
			{m.explore_tab_channels()}
		</a>
		<a href={resolve('/explore/tracks/recent')} class="btn" class:active={isTracksTab}>
			{m.explore_tab_tracks()}
		</a>
		<a href={resolve('/explore/tags/featured')} class="btn" class:active={isTagsTab}>
			{m.explore_tab_tags()}
		</a>

		<PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}
				<Icon icon="filter-alt" />
				{filterParam === 'recent' ? m.explore_tracks_filter_recent() : m.explore_tracks_filter_featured()}
			{/snippet}
			<menu class="nav-vertical">
				<button class:active={filterParam === 'featured'} onclick={() => goto(resolve('/explore/tags/featured'))}>
					{m.explore_tracks_filter_featured()}
				</button>
				<button class:active={filterParam === 'recent'} onclick={() => goto(resolve('/explore/tags/recent'))}>
					{m.explore_tracks_filter_recent()}
				</button>
			</menu>
		</PopoverMenu>

		<SearchInput bind:value={search} placeholder={m.tags_search_placeholder()} />

		<PopoverMenu style="margin-left: auto;" triggerAttachment={tooltip({content: m.tags_display_list()})}>
			{#snippet trigger()}
				<Icon icon={displayParam === 'cloud' ? 'tag' : 'unordered-list'} />
			{/snippet}
			<menu class="nav-vertical">
				<button class:active={displayParam === 'list'} onclick={() => setDisplay('list')}>
					<Icon icon="unordered-list" />
					{m.tags_display_list()}
				</button>
				<button class:active={displayParam === 'cloud'} onclick={() => setDisplay('cloud')}>
					<Icon icon="tag" />
					{m.tags_display_cloud()}
				</button>
			</menu>
			<menu class="nav-vertical">
				<button class:active={sortParam === 'count'} onclick={() => setSort('count')}>
					{m.tags_sort_count()}
				</button>
				<button class:active={sortParam === 'alpha'} onclick={() => setSort('alpha')}>
					{m.tags_sort_alpha()}
				</button>
			</menu>
		</PopoverMenu>
	</menu>

	{#if visibleTags.length}
		{#if displayParam === 'cloud'}
			<div class="cloud">
				{#each visibleTags as { value, count } (value)}
					<a
						href={tagSearchHref(value)}
						style="font-size: calc(0.75rem + {((count / maxCount) * 1.2).toFixed(2)}rem)"
						title="{count} tracks"
					>
						{value}
					</a>
				{/each}
			</div>
		{:else}
			<ol class="list tag-list">
				{#each visibleTags as { value, count } (value)}
					<li>
						<a class="row" href={tagSearchHref(value)}>
							<span class="tag-value">#{value}</span>
							<span class="count">{count}</span>
							<span class="bar" style="--pct: {tracks.length ? ((count / tracks.length) * 100).toFixed(1) : '0'}%"
							></span>
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	{:else if loaded}
		<p class="empty">—</p>
	{:else}
		<p class="empty">…</p>
	{/if}
</div>

<style>
	.layout {
		padding: 0.5rem;
	}

	.filtermenu {
		position: sticky;
		top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 1rem;
		z-index: 1;
	}

	.filtermenu :global(.search-input) {
		max-width: 10rem;
	}

	.tag-list {
		li {
			border-bottom: 0;
		}

		a.row {
			width: 100%;
			text-decoration: none;
			color: inherit;

			.tag-value {
				min-width: 6ch;
				color: var(--accent-9);
			}

			.count {
				flex: 0 0 auto;
				font-variant-numeric: tabular-nums;
				font-size: var(--font-2);
				color: light-dark(var(--gray-9), var(--gray-8));
			}

			.bar {
				flex: 1;
				height: 3px;
				background: linear-gradient(to left, var(--accent-9) var(--pct), var(--gray-6) var(--pct));
				border-radius: 1px;
				align-self: center;
				transition: height 100ms ease;
			}

			&:hover .bar {
				height: 0.75rem;
			}
		}
	}

	.cloud {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		margin: 0.5rem 0;
		line-height: 1.6;

		a {
			text-decoration: none;
			color: var(--accent-9);
			&:hover {
				text-decoration: underline;
			}
		}
	}

	.empty {
		color: light-dark(var(--gray-10), var(--gray-9));
	}
</style>
