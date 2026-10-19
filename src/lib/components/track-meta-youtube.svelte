<script>
	import {resolve} from '$app/paths'
	import {relativeDateDetailed, formatDuration} from '#lib/dates.js'
	import TrackMetaShell from '#lib/components/track-meta-shell.svelte'
	import * as m from '#lib/paraglide/messages.js'

	let {data} = $props()
</script>

<TrackMetaShell {data} emptyMessage={m.track_meta_no_youtube()}>
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
			<a href={resolve(`/search?q=${encodeURIComponent(data.channelTitle)}`)}>{data.channelTitle}</a
			>
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
</TrackMetaShell>

<style>
	.description {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.tags a {
		overflow-wrap: anywhere;
	}
</style>
