<script>
	import {sdk} from '@radio4000/sdk'
	import TrackCard from '$lib/components/track-card.svelte'
	import TrackList from '$lib/components/tracklist.svelte'
	import ChannelCard from '$lib/components/channel-card.svelte'
	import {onMount} from 'svelte'

	const slug = 'ko002'

	/** @type {import('$lib/types').Channel[]} */
	let channels = $state([])
	/** @type {import('$lib/types').Track[]} */
	let tracks = $state([])
	let loading = $state(true)

	let containerWidth = $state(600)

	onMount(async () => {
		const [trRes, chsRes] = await Promise.all([sdk.channels.readChannelTracks(slug, 6), sdk.channels.readChannels(3)])
		tracks = trRes.data ?? []
		channels = chsRes.data ?? []
		loading = false
	})
</script>

<svelte:head>
	<title>Cards — Debug</title>
</svelte:head>

<div class="container">
	<h1>Cards</h1>
	<p><small>Track and channel cards from <code>@{slug}</code>. Drag container edges to resize.</small></p>

	{#if loading}
		<p>Loading…</p>
	{:else}
		<section>
			<h2>TrackList</h2>
			<div class="resizable">
				<TrackList {tracks} />
			</div>
		</section>

		<section>
			<h2>TrackList — grouped</h2>
			<div class="resizable">
				<TrackList {tracks} grouped />
			</div>
		</section>

		<section>
			<h2>TrackCard — without artwork</h2>
			<ul class="list resizable">
				{#each tracks as track (track.id)}
					<li><TrackCard {track} showImage={false} /></li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>TrackCard — show @slug</h2>
			<ul class="list resizable">
				{#each tracks.slice(0, 3) as track (track.id)}
					<li><TrackCard {track} showSlug /></li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>TrackCard — editable</h2>
			<ul class="list resizable">
				{#each tracks.slice(0, 2) as track (track.id)}
					<li><TrackCard {track} canEdit /></li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>TrackCard — selected state</h2>
			<ul class="list resizable">
				{#each tracks.slice(0, 3) as track, i (track.id)}
					<li><TrackCard {track} selected={i < 2} /></li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>TrackCard — narrow</h2>
			<p><small>Tests <code>@container (width &lt; 80ch)</code></small></p>
			<ul class="list resizable" style="width: 300px;">
				{#each tracks.slice(0, 3) as track (track.id)}
					<li><TrackCard {track} showSlug /></li>
				{/each}
			</ul>
		</section>

		<section>
			<h2>ChannelCard — grid</h2>
			<div class="resizable">
				<div class="grid">
					{#each channels as ch (ch.id)}
						<ChannelCard channel={ch} />
					{/each}
				</div>
			</div>
		</section>

		<section>
			<h2>ChannelCard — list</h2>
			<div class="resizable">
				<div class="list">
					{#each channels as ch (ch.id)}
						<ChannelCard channel={ch} />
					{/each}
				</div>
			</div>
		</section>

		<section>
			<h2>Side-by-side: grid vs list</h2>
			<p>
				<small>Width: {containerWidth}px</small>
				<input type="range" min="200" max="900" bind:value={containerWidth} />
			</p>
			<div class="row" style="align-items: flex-start; flex-wrap: wrap;">
				<div style="flex: 1; min-width: 0;">
					<h3>Grid</h3>
					<div class="resizable grid" style:width="{containerWidth}px">
						{#each channels.slice(0, 2) as ch (ch.id)}
							<ChannelCard channel={ch} />
						{/each}
					</div>
				</div>
				<div style="flex: 1; min-width: 0;">
					<h3>List</h3>
					<div class="resizable list" style:width="{containerWidth}px">
						{#each channels.slice(0, 2) as ch (ch.id)}
							<ChannelCard channel={ch} />
						{/each}
					</div>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	section {
		margin-block: 2rem;
	}
	.resizable {
		resize: both;
		overflow: auto;
		border: 2px dashed gold;
		border-radius: var(--border-radius);
		padding: 0.5rem;
		min-width: 200px;
		min-height: 100px;
		max-width: 100%;
		container-type: inline-size;
	}
</style>
