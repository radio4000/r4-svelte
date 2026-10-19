<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {page} from '$app/state'
	import {appName} from '#lib/config.js'
	import {tagsCollection} from '#lib/collections/tags.js'
	import {useLiveQuery} from '#lib/useLiveQuery.svelte.js'
	import Icon from '#lib/components/icon.svelte'
	import PopoverMenu from '#lib/components/popover-menu.svelte'
	import SearchInput from '#lib/components/search-input.svelte'
	import ExplorePageHeader from '#lib/components/explore-page-header.svelte'
	import TagRow from '#lib/components/tag-row.svelte'
	import Seo from '#lib/components/seo.svelte'
	import {tooltip} from '#lib/components/tooltip-attachment.svelte.js'
	import * as m from '#lib/paraglide/messages.js'

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
		const query = new URL(page.url.href).searchParams
		if (value === 'list') query.delete('display')
		else query.set('display', value)
		goto(`?${query.toString()}`, {replace: true, reset: false})
	}

	function setSort(value) {
		const query = new URL(page.url.href).searchParams
		if (value === 'count') query.delete('sort')
		else query.set('sort', value)
		goto(`?${query.toString()}`, {replace: true, reset: false})
	}

	/** @param {string} tag */
	function tagSearchHref(tag) {
		return resolve('/search/tracks') + `?q=${encodeURIComponent('#' + tag)}`
	}
</script>

<Seo title={m.explore_title({appName})} plain />

<div class="layout">
	<ExplorePageHeader>
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
	</ExplorePageHeader>

	<div class="content">
		{#if visibleTags.length}
			{#if displayParam === 'cloud'}
				<div class="cloud">
					{#each visibleTags as { tag, count } (tag)}
						<a
							href={tagSearchHref(tag)}
							style="font-size: calc(0.75rem + {((count / maxCount) * 1.2).toFixed(2)}rem)"
							title={m.tracks_total_count({count})}
						>
							{tag}
						</a>
					{/each}
				</div>
			{:else}
				<ol class="list tag-list">
					{#each visibleTags as { tag, count } (tag)}
						<li>
							<TagRow {tag} {count} pct={(count / maxCount) * 100} href={tagSearchHref(tag)} />
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
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.content {
		padding: var(--space-1) 0.5rem 0.5rem;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.tag-list {
		li {
			border-bottom: 0;
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
