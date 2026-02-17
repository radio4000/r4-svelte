<script>
	import InfiniteCanvas from '$lib/components/infinite-canvas-ogl.svelte'
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

		const deckId = appState.active_deck_id
		const deck = appState.decks[deckId]
		const currentTrack = deck?.playlist_track ? tracksCollection.get(deck.playlist_track) : null
		const isSameChannel = currentTrack?.slug === item.slug

		if (isSameChannel && deck?.playlist_tracks.length > 1) {
			const randomId = deck.playlist_tracks[Math.floor(Math.random() * deck.playlist_tracks.length)]
			playTrack(deckId, randomId, 'user_next', 'user_click_track')
		} else {
			shufflePlayChannel(deckId, {id: item.id, slug: item.slug})
		}
	}
</script>

<svelte:head>
	<title>Infinite Canvas</title>
</svelte:head>

<article>
	<header>
		<menu class="nav-grouped">
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
	}
	header {
		padding: 0.5rem;
	}
	section {
		flex: 1;
		min-height: 0;
	}
</style>
