<script>
	import {resolve} from '$app/paths'
	import {relativeDateDetailed, formatDuration} from '$lib/dates.js'
	import Icon from '$lib/components/icon.svelte'
	import MetaDefinitionList from '$lib/components/meta-definition-list.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	let showRaw = $state(false)
</script>

{#if data}
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<MetaDefinitionList>
			{#if data.duration}
				<dt>{m.track_meta_duration()}</dt>
				<dd>{formatDuration(data.duration)}</dd>
			{/if}

			{#if data.publishedAt}
				<dt>{m.track_meta_published()}</dt>
				<dd>{relativeDateDetailed(data.publishedAt)}</dd>
			{/if}

			{#if data.channelTitle}
				<dt>{m.track_meta_channel()}</dt>
				<dd>
					<a href={resolve(`/search?q=${encodeURIComponent(data.channelTitle)}`)}>{data.channelTitle}</a>
				</dd>
			{/if}

			{#if data.thumbnails?.medium?.url}
				<dt>{m.track_meta_thumbnail()}</dt>
				<dd>
					<img src={data.thumbnails.medium.url} alt={m.track_meta_thumbnail_alt()} loading="lazy" />
				</dd>
			{/if}

			{#if data.description}
				<dt>{m.track_meta_description()}</dt>
				<dd class="description">{data.description}</dd>
			{/if}

			{#if data.tags && data.tags.length > 0}
				<dt>{m.track_meta_tags()}</dt>
				<dd class="tags">
					{#each data.tags as tag (tag)}
						<a href={resolve(`/search?q=${encodeURIComponent('#' + tag)}`)}>{tag}</a>
					{/each}
				</dd>
			{/if}
		</MetaDefinitionList>
	{/if}
	<menu class="meta-toolbar">
		<button
			type="button"
			onclick={() => (showRaw = !showRaw)}
			title={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
			aria-label={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
		>
			<Icon icon="code" size={16} />
		</button>
	</menu>
{:else}
	<p>{m.track_meta_no_youtube()}</p>
{/if}

<style>
	.meta-toolbar {
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.description {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.tags a {
		overflow-wrap: anywhere;
	}
</style>
