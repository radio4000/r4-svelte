<script>
	import {resolve} from '$app/paths'
	import {formatDurationMs} from '$lib/dates.js'
	import Icon from '$lib/components/icon.svelte'
	import MetaDefinitionList from '$lib/components/meta-definition-list.svelte'
	import * as m from '$lib/paraglide/messages'

	let {data, track} = $props()
	let showRaw = $state(false)

	const recording = $derived(data?.recording)
	const firstRelease = $derived(recording?.releases?.[0])
	const artistCredit = $derived(recording?.['artist-credit']?.[0])
</script>

{#if data}
	<menu class="meta-toolbar">
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
			{#if artistCredit?.artist?.name}
				<dt>{m.track_meta_artist()}</dt>
				<dd>
					<a
						href={resolve(
							`/search?q=${encodeURIComponent((track?.slug ? '@' + track.slug + ' ' : '') + artistCredit.artist.name)}`
						)}
					>
						{artistCredit.artist.name}
					</a>
				</dd>
			{/if}

			{#if recording?.title}
				<dt>{m.track_meta_recording()}</dt>
				<dd>{recording.title}</dd>
			{/if}

			{#if recording?.length}
				<dt>{m.track_meta_length()}</dt>
				<dd>{formatDurationMs(recording.length)}</dd>
			{/if}

			{#if recording?.['first-release-date']}
				<dt>{m.track_meta_first_release()}</dt>
				<dd>{recording['first-release-date']}</dd>
			{/if}

			{#if firstRelease}
				<dt>{m.track_meta_appears_on()}</dt>
				<dd>
					{firstRelease.title}
					{#if firstRelease.date}
						({firstRelease.date})
					{/if}
					{#if firstRelease.media?.[0]?.format}
						- {firstRelease.media[0].format}
					{/if}
				</dd>
			{/if}

			{#if recording?.releases?.length > 1}
				<dt>{m.track_meta_other_releases()}</dt>
				<dd>{m.track_meta_other_releases_count({count: recording.releases.length - 1})}</dd>
			{/if}

			{#if recording?.id}
				<dt>{m.track_meta_musicbrainz()}</dt>
				<dd>
					<a href="https://musicbrainz.org/recording/{recording.id}" target="_blank" rel="noopener noreferrer">
						{m.track_meta_view_musicbrainz()}
					</a>
				</dd>
			{/if}
		</MetaDefinitionList>
	{/if}
{:else}
	<p>{m.track_meta_no_musicbrainz()}</p>
{/if}

<style>
	.meta-toolbar {
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
</style>
