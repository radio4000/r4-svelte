<script>
	import {updateTrack} from '$lib/tanstack/collections/tracks'
	import R4DiscogsResource from './r4-discogs-resource.svelte'
	import * as m from '$lib/paraglide/messages'

	/** @type {{
	 *   data?: object,
	 *   track?: import('$lib/types').Track,
	 *   tracks?: import('$lib/types').Track[],
	 *   channel?: {id: string, slug: string},
	 *   canEdit?: boolean
	 * }} */
	let {data, track, tracks = [], channel, canEdit = false} = $props()

	let saving = $state(false)
	let saveError = $state('')
	let showRaw = $state(false)

	/** Track has a media/URL we can play */
	const trackHasMedia = $derived(!!(track?.url || track?.media_id))

	/** Called when user picks a video from the release for a track that has no URL */
	async function handleSelectMedia(uri, title) {
		if (!track || !channel) return
		saving = true
		saveError = ''
		try {
			await updateTrack(channel, track.id, {url: uri, title: title || track.title})
		} catch (e) {
			saveError = /** @type {Error} */ (e).message
		} finally {
			saving = false
		}
	}
</script>

{#if track?.discogs_url}
	<R4DiscogsResource
		url={track.discogs_url}
		full={true}
		slug={channel?.slug}
		{tracks}
		onSelectMedia={!trackHasMedia && canEdit ? handleSelectMedia : undefined}
	/>
{:else if !canEdit}
	<p>{m.track_meta_no_discogs()}</p>
{/if}

{#if saveError}
	<p class="error">{m.common_error()}: {saveError}</p>
{/if}

{#if data}
	<button onclick={() => (showRaw = !showRaw)}>
		{showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
	</button>
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<dl class="meta">
			{#if data.year || data.released}
				<dt>{m.track_meta_year()}</dt>
				<dd>{data.year || data.released}</dd>
			{/if}

			{#if data.labels?.[0]}
				<dt>{m.track_meta_label()}</dt>
				<dd>
					{data.labels[0].name}
					{#if data.labels[0].catno}
						- {data.labels[0].catno}
					{/if}
				</dd>
			{/if}

			{#if data.formats?.[0]}
				<dt>{m.track_meta_format()}</dt>
				<dd>
					{data.formats[0].name}
					{#if data.formats[0].descriptions?.length > 0}
						({data.formats[0].descriptions.join(', ')})
					{/if}
				</dd>
			{/if}

			{#if data.genres?.length > 0}
				<dt>{m.track_meta_genres()}</dt>
				<dd>
					{#each data.genres as genre, i (genre)}
						<a href="/search?q={encodeURIComponent(genre)}">{genre}</a>{i < data.genres.length - 1 ? ', ' : ''}
					{/each}
				</dd>
			{/if}

			{#if data.styles?.length > 0}
				<dt>{m.track_meta_styles()}</dt>
				<dd>
					{#each data.styles as style, i (style)}
						<a href="/search?q={encodeURIComponent(style)}">{style}</a>{i < data.styles.length - 1 ? ', ' : ''}
					{/each}
				</dd>
			{/if}

			{#if data.country}
				<dt>{m.track_meta_country()}</dt>
				<dd>{data.country}</dd>
			{/if}

			{#if data.thumb}
				<dt>{m.track_meta_cover()}</dt>
				<dd>
					<img src={data.thumb} alt={m.track_meta_cover_alt()} loading="lazy" />
				</dd>
			{/if}
		</dl>
	{/if}
{/if}

<style>
	.error {
		color: var(--red-6);
	}
</style>
