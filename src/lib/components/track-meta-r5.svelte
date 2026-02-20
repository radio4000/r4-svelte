<script>
	import {relativeDate} from '$lib/dates.js'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Icon from '$lib/components/icon.svelte'
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
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<dl class="meta">
			{#if data.title}
				<dt>{m.track_meta_title()}</dt>
				<dd>{data.title}</dd>
			{/if}

			{#if data.slug}
				<dt>{m.track_meta_channel()}</dt>
				<dd><a href="/{data.slug}">@{data.slug}</a></dd>
			{/if}

			{#if data.url}
				<dt>{m.track_meta_source()}</dt>
				<dd><a href={data.url} target="_blank" rel="noopener noreferrer">{m.track_meta_youtube()}</a></dd>
			{/if}

			{#if data.discogs_url}
				<dt>{m.track_meta_discogs()}</dt>
				<dd>
					<a href={data.discogs_url} target="_blank" rel="noopener noreferrer">{m.track_meta_view_release()}</a>
				</dd>
			{/if}

			{#if data.tags && data.tags.length > 0}
				<dt>{m.track_meta_tags()}</dt>
				<dd class="tags">
					{#each data.tags as tag (tag)}
						<a href="/search?q={encodeURIComponent(data.slug ? `@${data.slug} #${tag}` : `#${tag}`)}">#{tag}</a>
					{/each}
				</dd>
			{/if}

			{#if data.mentions && data.mentions.length > 0}
				<dt>mentions</dt>
				<dd class="mentions">
					{#each data.mentions as mention (mention)}
						<a href="/{mention}">@{mention}</a>
					{/each}
				</dd>
			{/if}

			{#if data.created_at}
				<dt>{m.track_meta_added()}</dt>
				<dd>{relativeDate(data.created_at)}</dd>
			{/if}

			{#if data.updated_at && data.updated_at !== data.created_at}
				<dt>{m.track_meta_updated()}</dt>
				<dd>{relativeDate(data.updated_at)}</dd>
			{/if}

			{#if data.duration}
				<dt>{m.track_meta_duration()}</dt>
				<dd>{formatDuration(data.duration)}</dd>
			{/if}

			{#if data.playback_error}
				<dt>{m.track_meta_playback_error()}</dt>
				<dd>{data.playback_error}</dd>
			{/if}

			{#if data.description}
				<dt>{m.track_meta_description()}</dt>
				<dd class="description"><LinkEntities slug={data.slug ?? undefined} text={data.description} /></dd>
			{/if}

			<dt>{m.track_meta_metadata()}</dt>
			<dd>
				{#if data.has_youtube_meta}{m.track_meta_flag_youtube()}{/if}
				{#if data.has_musicbrainz_meta}{m.track_meta_flag_musicbrainz()}{/if}
				{#if data.has_discogs_meta}{m.track_meta_flag_discogs()}{/if}
			</dd>
		</dl>
	{/if}
	<div class="meta-toolbar">
		<button
			type="button"
			onclick={() => (showRaw = !showRaw)}
			title={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
			aria-label={showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
		>
			<Icon icon="code" size={16} />
		</button>
	</div>
{:else}
	<p>{m.track_meta_no_data()}</p>
{/if}

<style>
	.meta-toolbar {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.description {
		white-space: pre-wrap;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.mentions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.tags a,
	.mentions a,
	.description :global(a),
	.description :global(.tag-link) {
		display: inline-flex;
		align-items: center;
		padding: 0.12rem 0.45rem;
		border: 1px solid var(--gray-5);
		border-radius: 999px;
		text-decoration: none;
	}

	.description :global(a),
	.description :global(.tag-link) {
		margin-right: 0.3rem;
		margin-bottom: 0.25rem;
	}
</style>
