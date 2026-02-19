<script>
	import {untrack} from 'svelte'
	import {pullDiscogs} from '$lib/metadata/discogs'
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

	let editingUrl = $state(untrack(() => track?.discogs_url ?? ''))
	let saving = $state(false)
	let saveError = $state('')
	let showRaw = $state(false)
	/** Show the URL edit form — always open when no discogs_url, toggled when one exists */
	let showUrlEdit = $state(untrack(() => !track?.discogs_url))

	const livePreviewUrl = $derived(editingUrl?.includes('discogs.com') ? editingUrl : '')

	const discogsSearchUrl = $derived(
		track?.title
			? `https://www.discogs.com/search?q=${encodeURIComponent(track.title)}&type=release`
			: 'https://www.discogs.com/search'
	)

	/** Track has a media/URL we can play */
	const trackHasMedia = $derived(!!(track?.url || track?.media_id))

	async function handleSave() {
		if (!track || !channel) return
		saving = true
		saveError = ''
		try {
			const url = editingUrl || null
			await updateTrack(channel, track.id, {discogs_url: url})
			if (track.media_id && url) {
				await pullDiscogs(track.media_id, url)
			}
			showUrlEdit = false
		} catch (e) {
			saveError = /** @type {Error} */ (e).message
		} finally {
			saving = false
		}
	}

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
		{tracks}
		onSelectMedia={!trackHasMedia && canEdit ? handleSelectMedia : undefined}
	/>
{:else if !canEdit}
	<p>{m.track_meta_no_discogs()}</p>
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

{#if canEdit}
	<section class="discogs-edit">
		{#if track?.discogs_url && !showUrlEdit}
			<button type="button" class="ghost change-btn" onclick={() => (showUrlEdit = true)}> Change release </button>
		{:else}
			<fieldset>
				<label for="discogs-url-input">Discogs URL</label>
				<input
					id="discogs-url-input"
					type="url"
					value={editingUrl}
					oninput={(e) => (editingUrl = /** @type {HTMLInputElement} */ (e.target).value)}
					placeholder="https://www.discogs.com/release/..."
				/>
			</fieldset>

			{#if livePreviewUrl && livePreviewUrl !== track?.discogs_url}
				<R4DiscogsResource url={livePreviewUrl} full={true} {tracks} />
			{/if}

			<div class="discogs-actions">
				<a href={discogsSearchUrl} target="_blank" rel="noopener noreferrer">Search Discogs</a>
				{#if track?.discogs_url}
					<button type="button" class="ghost" onclick={() => (showUrlEdit = false)}>Cancel</button>
				{/if}
				<button onclick={handleSave} disabled={saving || !livePreviewUrl}>
					{saving ? m.common_save() + '...' : m.common_save()}
				</button>
			</div>
		{/if}

		{#if saveError}
			<p class="error">{m.common_error()}: {saveError}</p>
		{/if}
	</section>
{/if}

<style>
	.discogs-edit {
		display: flex;
		flex-flow: column;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--gray-3);

		fieldset {
			display: flex;
			flex-flow: column;
			gap: 0.25rem;
			border: 0;
			padding: 0;
			margin: 0;
		}
	}

	.discogs-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.change-btn {
		align-self: flex-start;
		font-size: var(--font-3);
		color: var(--gray-8);
	}

	.error {
		color: var(--red-6);
	}
</style>
