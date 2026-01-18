<script>
	import InfiniteCanvas from '$lib/components/infinite-canvas.svelte'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl} from '$lib/utils'
	import {shufflePlayChannel, playTrack} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'

	let media = $derived(
		[...channelsCollection.state.values()]
			.filter((c) => c.image)
			.map((c) => ({
				url: channelAvatarUrl(/** @type {string} */ (c.image)),
				width: 250,
				height: 250,
				slug: c.slug,
				id: c.id
			}))
	)

	function handleClick(item) {
		if (!item.slug || !item.id) return

		const currentTrack = appState.playlist_track ? tracksCollection.get(appState.playlist_track) : null
		const isSameChannel = currentTrack?.slug === item.slug

		if (isSameChannel && appState.playlist_tracks.length > 1) {
			const randomId = appState.playlist_tracks[Math.floor(Math.random() * appState.playlist_tracks.length)]
			playTrack(randomId, 'user_next', 'user_click_track')
		} else {
			shufflePlayChannel({id: item.id, slug: item.slug})
		}
	}
</script>

<svelte:head>
	<title>Infinite Canvas</title>
</svelte:head>

<article>
	<header>
		<menu data-grouped>
			<a href="/_debug">&larr;</a>
		</menu>
		<h1>Infinite Canvas</h1>
		<p>Use <kbd>WASD</kbd>/<kbd>arrows</kbd> to move, <kbd>QE</kbd> for up/down, scroll to zoom, drag to pan.</p>
	</header>
	<section>
		<InfiniteCanvas {media} onclick={handleClick} />
	</section>
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		height: 100dvh;
	}
	header {
		padding: 0.5rem;
	}
	section {
		flex: 1;
		min-height: 0;
	}
</style>
