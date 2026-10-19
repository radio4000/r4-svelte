<script>
	import Icon from '#lib/components/icon.svelte'
	import MetaDefinitionList from '#lib/components/meta-definition-list.svelte'
	import * as m from '#lib/paraglide/messages.js'

	/** @type {{
	 *   data: unknown,
	 *   emptyMessage: string,
	 *   toolbarExtra?: import('svelte').Snippet,
	 *   children?: import('svelte').Snippet
	 * }} */
	let {data, emptyMessage, toolbarExtra, children} = $props()

	let showRaw = $state(false)
</script>

{#if data}
	<menu class="meta-toolbar">
		{@render toolbarExtra?.()}
		<button
			type="button"
			onclick={() => (showRaw = !showRaw)}
			title={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
			aria-label={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
		>
			<Icon icon="code" />
		</button>
	</menu>
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<MetaDefinitionList>
			{@render children?.()}
		</MetaDefinitionList>
	{/if}
{:else}
	<p>{emptyMessage}</p>
{/if}

<style>
	.meta-toolbar {
		justify-content: flex-end;
		gap: var(--space-1);
		margin-top: 0.5rem;
	}
</style>
