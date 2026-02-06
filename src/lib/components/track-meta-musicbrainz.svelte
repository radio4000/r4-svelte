<script>
	import * as m from '$lib/paraglide/messages'

	let {data, track} = $props()
	let showRaw = $state(false)

	function formatLength(ms) {
		if (!ms) return ''
		const seconds = Math.floor(ms / 1000)
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	const recording = $derived(data?.recording)
	const firstRelease = $derived(recording?.releases?.[0])
	const artistCredit = $derived(recording?.['artist-credit']?.[0])
</script>

{#if data}
	<button onclick={() => (showRaw = !showRaw)}>
		{showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
	</button>
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<dl class="meta">
			{#if artistCredit?.artist?.name}
				<dt>{m.track_meta_artist()}</dt>
				<dd>
					<a
						href="/search?q={encodeURIComponent(
							(track?.slug ? '@' + track.slug + ' ' : '') + artistCredit.artist.name
						)}"
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
				<dd>{formatLength(recording.length)}</dd>
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
		</dl>
	{/if}
{:else}
	<p>{m.track_meta_no_musicbrainz()}</p>
{/if}
