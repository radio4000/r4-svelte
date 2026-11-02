<script lang="ts">
	import Dialog from '#lib/components/dialog.svelte'
	import Icon from '#lib/components/icon.svelte'
	import * as m from '#lib/paraglide/messages.js'
	import type {Snippet} from 'svelte'

	const AT_PREFIX = /^@/

	/**
	 * Browsable, searchable channel list in a dialog — click a channel to toggle it.
	 * Same interaction as TagsFilterDialog, mirrored for @channel filtering.
	 */
	let {
		showModal = $bindable(false),
		channels,
		selectedChannels,
		onToggleChannel,
		dialogHeader,
		dialogTop
	}: {
		showModal: boolean
		channels: {slug: string; name: string; count?: number}[]
		selectedChannels: string[]
		onToggleChannel: (slug: string) => void
		dialogHeader?: Snippet
		dialogTop?: Snippet
	} = $props()

	let channelsSearch = $state('')

	// A typed slug that isn't in the known list yet can still be added by hand
	// and used as a filter directly.
	const customChannelCandidate = $derived(
		channelsSearch.trim().toLowerCase().replace(AT_PREFIX, '')
	)
	let visibleChannels = $derived.by(() => {
		const q = customChannelCandidate
		if (!q) return channels
		return channels.filter(
			(c) => c.slug.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
		)
	})
	const canAddCustomChannel = $derived(
		customChannelCandidate.length > 0 &&
			!channels.some((c) => c.slug.toLowerCase() === customChannelCandidate) &&
			!selectedChannels.some((c) => c.toLowerCase() === customChannelCandidate)
	)

	function addCustomChannel() {
		if (!canAddCustomChannel) return
		onToggleChannel(customChannelCandidate)
		channelsSearch = ''
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
				<h3>{m.views_channels_label()}</h3>
				<div class="channels-search-row">
					<input
						type="search"
						bind:value={channelsSearch}
						placeholder={m.channels_search_placeholder()}
						onkeydown={(e) => e.key === 'Enter' && addCustomChannel()}
					/>
				</div>
				{#if canAddCustomChannel}
					<button type="button" class="add-custom-tag" onclick={addCustomChannel}>
						<Icon icon="add" size={14} />
						{m.channels_add_custom({slug: customChannelCandidate})}
					</button>
				{/if}
				{#if visibleChannels.length}
					<menu class="tags-filter">
						{#each visibleChannels as { slug, name, count } (slug)}
							<button
								type="button"
								class:active={selectedChannels.includes(slug)}
								onclick={() => onToggleChannel(slug)}
							>
								@{slug} <span class="channel-name">{name}</span>
								{#if count}<span class="tag-count">({count})</span>{/if}
							</button>
						{/each}
					</menu>
				{:else}
					<p class="tags-empty">{m.channels_empty()}</p>
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
		overscroll-behavior: contain;
		button.active {
			background: var(--accent-5);
			color: var(--accent-11);
		}
	}

	.channels-search-row {
		display: flex;
		gap: var(--space-1);
	}

	.channels-search-row input {
		flex: 1;
	}

	.add-custom-tag {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		justify-content: center;
		color: var(--accent-11);
	}

	.channel-name {
		opacity: 0.8;
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
