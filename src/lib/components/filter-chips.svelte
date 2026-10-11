<script lang="ts">
	/** Removable chips showing the active filter selection — same UI wherever tags can be filtered. */
	let {
		tags = [],
		channels = [],
		matching = '',
		mention = '',
		search = '',
		onRemoveTag,
		onRemoveChannel,
		onClearMatching,
		onClearMention
	}: {
		tags?: string[]
		channels?: string[]
		matching?: string
		mention?: string
		search?: string
		onRemoveTag?: (tag: string) => void
		onRemoveChannel?: (slug: string) => void
		onClearMatching?: () => void
		onClearMention?: () => void
	} = $props()
</script>

<menu class="row filter-chips">
	{#if search}
		<span class="chip">"{search}"</span>
	{/if}
	{#if mention}
		<button type="button" class="chip" onclick={onClearMention}>Mention: @{mention} ×</button>
	{/if}
	{#if matching}
		<button type="button" class="chip" onclick={onClearMatching}>@{matching} ×</button>
	{/if}
	{#each channels as slug (slug)}
		<button type="button" class="chip" onclick={() => onRemoveChannel?.(slug)}>@{slug} ×</button>
	{/each}
	{#each tags as tag (tag)}
		<button type="button" class="chip" onclick={() => onRemoveTag?.(tag)}>#{tag} ×</button>
	{/each}
</menu>

<style>
	.filter-chips {
		flex-wrap: wrap;
		gap: var(--space-1);
	}
</style>
