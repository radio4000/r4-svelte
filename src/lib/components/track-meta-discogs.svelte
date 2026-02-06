<script>
	import * as m from '$lib/paraglide/messages'

	let {data} = $props()
	let showRaw = $state(false)
</script>

{#if data}
	<button onclick={() => (showRaw = !showRaw)}>
		{showRaw ? m.track_meta_toggle_formatted() : m.track_meta_toggle_raw()}
	</button>
	{#if showRaw}
		<pre><code>{JSON.stringify(data, null, 2)}</code></pre>
	{:else}
		<dl class="meta">
			{#if data.title}
				<dt>{m.track_meta_release()}</dt>
				<dd>{data.title}</dd>
			{/if}

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

			{#if data.uri}
				<dt>{m.track_meta_discogs()}</dt>
				<dd>
					<a href={data.uri} target="_blank" rel="noopener noreferrer"> {m.track_meta_view_discogs()} </a>
				</dd>
			{/if}
		</dl>
	{/if}
{:else}
	<p>{m.track_meta_no_discogs()}</p>
{/if}
