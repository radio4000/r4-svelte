<script>
	import {page} from '$app/state'
	import Icon from '$lib/components/icon.svelte'
	import {formatDate} from '$lib/dates'
	import {playHistoryCollection, getTracksCollection, getChannelsCollection} from '$lib/collections'

	// Get history sorted by started_at DESC
	const history = $derived(
		playHistoryCollection.toArray.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
	)

	// Client-side join: create lookup of tracks with channel info
	const tracksLookup = $derived.by(() => {
		const tracksCollection = getTracksCollection()
		const channelsCollection = getChannelsCollection()

		const tracks = tracksCollection.toArray
		const channels = channelsCollection.toArray
		const channelMap = new Map(channels.map((c) => [c.id, c]))

		return new Map(
			tracks.map((t) => {
				const channel = channelMap.get(t.channel_id)
				return [
					t.id,
					{
						id: t.id,
						title: t.title,
						url: t.url,
						channel_name: channel?.name,
						channel_slug: channel?.slug || t.channel_slug
					}
				]
			})
		)
	})
</script>

<svelte:head>
	<title>Play history - R5</title>
</svelte:head>

<article class="SmallContainer">
	<menu>
		<a class="btn" href="/stats" class:active={page.route.id === '/stats'}>
			<Icon icon="chart-scatter" size={20} /> Stats
		</a>
		<a class="btn" href="/history" class:active={page.route.id === '/history'}>
			<Icon icon="history" size={20} /> History
		</a>
	</menu>

	<header>
		<h1>Playback history</h1>
		<p>Note, this data is all local. Only you see it.</p>
	</header>

	{#if history.length === 0}
		<p>no play history found</p>
	{:else}
		<ul class="list">
			{#each history as play (play.id)}
				<li>
					{@render playRecord(play, tracksLookup.get(play.track_id))}
				</li>
			{/each}
		</ul>
	{/if}
</article>

{#snippet playRecord(play, track)}
	<article class="row">
		<header>
			<span class="channel">
				<a href={`/${track.channel_slug}`}>@{track.channel_slug}</a>
			</span>
			<span class="track">
				{#if track}
					<a href={`/${track.channel_slug}/tracks/${track.id}`}>{track.title}</a>
				{:else}
					{play.track_id}
				{/if}
			</span>
		</header>
		<div class="reasons">{play.reason_start || ''} → {play.reason_end || ''}</div>
		<div class="meta">
			<time>
				{formatDate(new Date(play.started_at))}
				{new Date(play.started_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
				{#if play.ms_played}(played {Math.round(play.ms_played / 1000)}s)
				{/if}
			</time>
			{#if play.shuffle}(shuffled){/if}
			{#if play.skipped}(skipped){/if}
		</div>
	</article>
{/snippet}

<style>
	.SmallContainer {
		margin-top: 0.5rem;

		> menu,
		> header {
			margin-bottom: 1rem;
		}
	}

	.row {
		color: var(--gray-9);
		padding: 0.2rem 0;
	}

	a {
		text-decoration: none;
	}

	.channel a {
		background: var(--test-green);
		color: var(--test-white);
	}

	.track a {
		background: var(--test-magenta);
		color: var(--test-yellow);
	}

	.reasons {
		color: var(--gray-11);
	}
</style>
