<script lang="ts">
	import Dialog from '#lib/components/dialog.svelte'
	import PopoverMenu from '#lib/components/popover-menu.svelte'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import type {Snippet} from 'svelte'

	/**
	 * Browsable, searchable/sortable tag list in a dialog — click a tag to toggle it.
	 * Shared by the channel tracks page and /search (all/tracks/channels): same
	 * interaction, different sources for `tags`/`selectedTags`/`onToggleTag`.
	 */
	let {
		showModal = $bindable(false),
		tags,
		selectedTags,
		onToggleTag,
		dialogHeader,
		dialogTop
	}: {
		showModal: boolean
		tags: {value: string; count: number}[]
		selectedTags: string[]
		onToggleTag: (tag: string) => void
		dialogHeader?: Snippet
		dialogTop?: Snippet
	} = $props()

	let tagsSearch = $state('')
	let tagsSort = $state<'count' | 'alpha'>('count')
	let tagsDirection = $state<'asc' | 'desc'>('desc')
	const tagsSortOptions = [
		{value: 'count' as const, icon: 'hash' as const, label: () => m.tags_sort_count()},
		{value: 'alpha' as const, icon: 'sort' as const, label: () => m.tags_sort_alpha()}
	]
	let selectedTagsSort = $derived(
		tagsSortOptions.find((option) => option.value === tagsSort) ?? tagsSortOptions[0]
	)
	let visibleTags = $derived.by(() => {
		const q = tagsSearch.trim().toLowerCase()
		const filtered = tags.filter((tag) => !q || tag.value.includes(q))
		const dir = tagsDirection === 'asc' ? 1 : -1
		return filtered.toSorted((a, b) => {
			const base =
				tagsSort === 'alpha'
					? a.value.localeCompare(b.value)
					: a.count - b.count || a.value.localeCompare(b.value)
			return base * dir
		})
	})

	// A typed tag that isn't in the known list yet — e.g. one too new/rare to have
	// surfaced here — can still be added by hand and used as a filter directly.
	const customTagCandidate = $derived(tagsSearch.trim().replace(/^#/, '').toLowerCase())
	const canAddCustomTag = $derived(
		customTagCandidate.length > 0 &&
			!tags.some((t) => t.value.toLowerCase() === customTagCandidate) &&
			!selectedTags.some((t) => t.toLowerCase() === customTagCandidate)
	)

	function addCustomTag() {
		if (!canAddCustomTag) return
		onToggleTag(customTagCandidate)
		tagsSearch = ''
	}
</script>

{#if showModal}
	<Dialog bind:showModal>
		{#snippet header()}
			{@render dialogHeader?.()}
		{/snippet}
		<section class="filters-dialog">
			{@render dialogTop?.()}
			<section class="filters-dialog-panel">
				<h3>{m.views_tags_label()}</h3>
				<div class="tags-toolbar">
					<div class="tags-search-row">
						<input
							type="search"
							bind:value={tagsSearch}
							placeholder={m.tags_search_placeholder()}
							onkeydown={(e) => e.key === 'Enter' && addCustomTag()}
						/>
						<PopoverMenu>
							{#snippet trigger()}
								<Icon icon={selectedTagsSort.icon} />
								{selectedTagsSort.label()}
							{/snippet}
							<menu class="tags-sort-options nav-vertical">
								{#each tagsSortOptions as option (option.value)}
									<button
										type="button"
										class:active={tagsSort === option.value}
										onclick={() => (tagsSort = option.value)}
										title={option.label()}
									>
										<Icon icon={option.icon} />
										{option.label()}
									</button>
								{/each}
							</menu>
						</PopoverMenu>
						<button
							type="button"
							class="ghost"
							title={tagsDirection === 'asc'
								? m.channels_tooltip_sort_asc()
								: m.channels_tooltip_sort_desc()}
							onclick={() => (tagsDirection = tagsDirection === 'asc' ? 'desc' : 'asc')}
						>
							<Icon icon={tagsDirection === 'asc' ? 'funnel-ascending' : 'funnel-descending'} />
						</button>
					</div>
				</div>
				{#if canAddCustomTag}
					<button type="button" class="add-custom-tag" onclick={addCustomTag}>
						<Icon icon="add" size={14} />
						{m.tags_add_custom({tag: customTagCandidate})}
					</button>
				{/if}
				{#if visibleTags.length}
					<menu class="tags-filter">
						{#each visibleTags as { value, count } (value)}
							<button
								type="button"
								class:active={selectedTags.includes(value)}
								onclick={() => onToggleTag(value)}
							>
								#{value} <span class="tag-count">({count})</span>
							</button>
						{/each}
					</menu>
				{:else}
					<p class="tags-empty">{m.tags_empty()}</p>
				{/if}
			</section>
		</section>
	</Dialog>
{/if}

<style>
	.filters-dialog {
		display: grid;
		gap: 0.75rem;
	}

	.filters-dialog-panel {
		display: grid;
		gap: var(--space-1);
		h3 {
			margin: 0;
		}
	}

	.tags-filter {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		max-height: min(32vh, 22rem);
		overflow: auto;
		button.active {
			background: var(--accent-5);
			color: var(--accent-11);
		}
	}

	.tags-toolbar {
		display: grid;
		gap: var(--space-1);
	}

	.tags-search-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-1);
	}

	.add-custom-tag {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		justify-content: center;
		color: var(--accent-11);
	}

	.tags-sort-options {
		min-width: 10rem;
	}

	.tags-sort-options button {
		justify-content: flex-start;
	}

	.tag-count {
		opacity: 0.6;
		font-size: 0.85em;
	}

	.tags-empty {
		margin: 0;
		padding: var(--space-2) 0;
		color: light-dark(var(--gray-9), var(--gray-8));
	}
</style>
