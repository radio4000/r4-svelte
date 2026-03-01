<script>
	import {resolve} from '$app/paths'
	import {relativeDate, formatDuration} from '$lib/dates.js'
	import LinkEntities from '$lib/components/link-entities.svelte'
	import Tag from '$lib/components/tag.svelte'
	import Icon from '$lib/components/icon.svelte'
	import MetaDefinitionList from '$lib/components/meta-definition-list.svelte'
	import {parseUrl} from 'media-now/parse-url'
	import {parseTitle} from 'media-now/parse-title'
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	let showRaw = $state(false)
	const sourceProvider = $derived(data?.provider || (data?.url ? parseUrl(data.url)?.provider : null) || null)
	const parsedTitle = $derived(data?.title ? parseTitle(data.title) : null)
	const parsedArtist = $derived(parsedTitle?.artist || null)
	const parsedRecording = $derived(parsedTitle?.title || null)
	const hasMetadata = $derived(
		Boolean(
			data?.has_youtube_meta ||
			data?.has_musicbrainz_meta ||
			data?.has_discogs_meta ||
			data?.youtube_data ||
			data?.musicbrainz_data ||
			data?.discogs_data
		)
	)
</script>

{#if data}
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
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<MetaDefinitionList>
			{#if data.slug}
				<dt><Icon icon="radio" size={14} /> {m.track_meta_channel()}</dt>
				<dd><a href={resolve(`/${data.slug}`)}>@{data.slug}</a></dd>
			{/if}

			{#if data.title}
				<dt><Icon icon="html" size={14} /> {m.track_meta_title()}</dt>
				<dd>{data.title}</dd>
			{/if}

			{#if parsedArtist}
				<dt><Icon icon="users" size={14} /> {m.track_meta_artist()}</dt>
				<dd>{parsedArtist}</dd>
			{/if}

			{#if parsedRecording && parsedRecording !== data.title}
				<dt><Icon icon="circle-info" size={14} /> {m.track_meta_recording()}</dt>
				<dd>{parsedRecording}</dd>
			{/if}

			{#if data.description}
				<dt><Icon icon="message-circle" size={14} /> {m.track_meta_description()}</dt>
				<dd class="description"><LinkEntities slug={data.slug ?? undefined} text={data.description} /></dd>
			{/if}

			{#if data.duration}
				<dt><Icon icon="history" size={14} /> {m.track_meta_duration()}</dt>
				<dd>{formatDuration(data.duration)}</dd>
			{/if}

			{#if data.tags && data.tags.length > 0}
				<dt><Icon icon="tag" size={14} /> {m.track_meta_tags()}</dt>
				<dd class="tags">
					{#each data.tags as tag (tag)}
						<Tag href="/search?q={encodeURIComponent(data.slug ? `@${data.slug} #${tag}` : `#${tag}`)}">#{tag}</Tag>
					{/each}
				</dd>
			{/if}

			{#if data.mentions && data.mentions.length > 0}
				<dt><Icon icon="users" size={14} /> {m.track_meta_mentions()}</dt>
				<dd class="mentions">
					{#each data.mentions as mention (mention)}
						<Tag href="/{mention}">@{mention}</Tag>
					{/each}
				</dd>
			{/if}

			{#if data.created_at}
				<dt><Icon icon="history" size={14} /> {m.track_meta_added()}</dt>
				<dd>{relativeDate(data.created_at)}</dd>
			{/if}

			{#if data.updated_at && data.updated_at !== data.created_at}
				<dt><Icon icon="history" size={14} /> {m.track_meta_updated()}</dt>
				<dd>{relativeDate(data.updated_at)}</dd>
			{/if}

			{#if data.url}
				<dt><Icon icon="document-download" size={14} /> {m.track_meta_source()}</dt>
				<dd>
					<a {...{href: data.url, target: '_blank', rel: 'noopener noreferrer'}}>
						{sourceProvider || 'unknown'}
					</a>
				</dd>
			{/if}

			{#if hasMetadata}
				<dt><Icon icon="sparkles" size={14} /> {m.track_meta_metadata()}</dt>
				<dd>
					{#if data.has_youtube_meta || data.youtube_data}{m.track_meta_flag_youtube()}{/if}
					{#if data.has_musicbrainz_meta || data.musicbrainz_data}{m.track_meta_flag_musicbrainz()}{/if}
					{#if data.has_discogs_meta || data.discogs_data}{m.track_meta_flag_discogs()}{/if}
				</dd>
			{/if}
		</MetaDefinitionList>
	{/if}
{:else}
	<p>{m.track_meta_no_data()}</p>
{/if}

<style>
	.meta-toolbar {
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
</style>
