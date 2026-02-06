<script>
	import {relativeDateDetailed} from '$lib/dates.js'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	let showRaw = $state(false)

	function formatDuration(seconds) {
		if (!seconds) return ''
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}
</script>

{#if data}
	<button onclick={() => (showRaw = !showRaw)}>
		{showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
	</button>

	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<dl class="meta">
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
					<a href="/search?q={encodeURIComponent(data.channelTitle)}">{data.channelTitle}</a>
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
						<a href="/search?q={encodeURIComponent('#' + tag)}">{tag}</a>
					{/each}
				</dd>
			{/if}
		</dl>
	{/if}
{:else}
	<p>{m.track_meta_no_youtube()}</p>
{/if}
