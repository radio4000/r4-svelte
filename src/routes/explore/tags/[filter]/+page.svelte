<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '$lib/config'
	import {tagsCollection} from '$lib/collections/tags'
	import {useLiveQuery} from '$lib/useLiveQuery.svelte'
	import Icon from '$lib/components/icon.svelte'
	import PopoverMenu from '$lib/components/popover-menu.svelte'
	import SearchInput from '$lib/components/search-input.svelte'
	import ExploreSectionMenu from '$lib/components/explore-section-menu.svelte'
	import PageHeader from '$lib/components/page-header.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'

	let search = $state('')

	const displayParam = $derived(page.url.searchParams.get('display') === 'cloud' ? 'cloud' : 'list')
	const sortParam = $derived(page.url.searchParams.get('sort') === 'alpha' ? 'alpha' : 'count')

	const tagsQuery = useLiveQuery((q) => q.from({tags: tagsCollection}))

	const allTags = $derived.by(() => {
		/** @type {{tag: string, count: number}[]} */
		const raw = tagsQuery.data ?? []
		if (sortParam === 'alpha') return raw.toSorted((a, b) => a.tag.localeCompare(b.tag))
		return raw.toSorted((a, b) => b.count - a.count)
	})

	const visibleTags = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return q ? allTags.filter((t) => t.tag.includes(q)) : allTags
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
		return resolve('/search/tracks') + `?q=${encodeURIComponent('#' + tag)}`
	}
</script>

<svelte:head>
	<title>{m.explore_title({appName})}</title>
</svelte:head>

<div class="layout">
	<PageHeader>
		<ExploreSectionMenu />

		<!-- <PopoverMenu triggerAttachment={tooltip({content: m.channels_filter_label()})}>
			{#snippet trigger()}
				<Icon icon="filter-alt" />
				{filterParam === 'recent' ? m.explore_tracks_filter_recent() : m.explore_tracks_filter_featured()}
			{/snippet}
			<menu class="nav-vertical">
				<button class:active={filterParam === 'featured'} onclick={() => goto(resolve('/tags/featured'))}>
					{m.explore_tracks_filter_featured()}
				</button>
				<button class:active={filterParam === 'recent'} onclick={() => goto(resolve('/tags/recent'))}>
					{m.explore_tracks_filter_recent()}
				</button>
			</menu>
		</PopoverMenu> -->

		<SearchInput bind:value={search} placeholder={m.tags_search_placeholder()} />

		<PopoverMenu triggerAttachment={tooltip({content: m.tags_display_list()})}>
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
	</PageHeader>

	{#if visibleTags.length}
		{#if displayParam === 'cloud'}
			<div class="cloud">
				{#each visibleTags as { tag, count } (tag)}
					<a
						href={tagSearchHref(tag)}
						style="font-size: calc(0.75rem + {((count / maxCount) * 1.2).toFixed(2)}rem)"
						title="{count} tracks"
					>
						{tag}
					</a>
				{/each}
			</div>
		{:else}
			<ol class="list tag-list">
				{#each visibleTags as { tag, count } (tag)}
					<li>
						<a class="row" href={tagSearchHref(tag)}>
							<span class="tag-value">#{tag}</span>
							<span class="count">{count}</span>
							<span class="bar" style="--pct: {((count / maxCount) * 100).toFixed(1)}%"></span>
						</a>
					</li>
				{/each}
			</ol>
		{/if}
	{:else if tagsQuery.isReady}
		<p class="empty">—</p>
	{:else}
		<p class="empty">…</p>
	{/if}
</div>

<style>
	.layout {
		padding: 0.5rem;
	}

	:global(.page-header) {
		margin-bottom: 0.25rem;
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
					flex: 1 1 auto;
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					color: var(--accent-9);
				}

			.count {
				flex: 0 0 auto;
				font-variant-numeric: tabular-nums;
				font-size: var(--font-2);
				color: light-dark(var(--gray-9), var(--gray-8));
			}

				.bar {
					flex: 1 1 6rem;
					min-width: 3rem;
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
			display: inline-block;
			max-width: min(24ch, 100%);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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
