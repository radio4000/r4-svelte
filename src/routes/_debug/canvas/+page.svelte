<script>
	import InfiniteCanvas from '$lib/components/infinite-canvas.svelte'
	import InfiniteCanvasOGL from '$lib/components/infinite-canvas-ogl.svelte'
	import {channelsCollection, tracksCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl} from '$lib/utils'
	import {shufflePlayChannel, playTrack} from '$lib/api'
	import {appState} from '$lib/app-state.svelte'

	let useOGL = $state(true)
	let fps = $state(0)
	let lastFrameTime = 0
	let frameCount = 0

	// Calculate FPS
	$effect(() => {
		let frameId
		const measureFPS = (timestamp) => {
			frameCount++
			if (timestamp - lastFrameTime >= 1000) {
				fps = Math.round((frameCount * 1000) / (timestamp - lastFrameTime))
				frameCount = 0
				lastFrameTime = timestamp
			}
			frameId = requestAnimationFrame(measureFPS)
		}
		frameId = requestAnimationFrame(measureFPS)
		return () => cancelAnimationFrame(frameId)
	})

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

<article class="fill-height">
	<header>
		<menu data-grouped>
			<a href="/_debug">&larr;</a>
		</menu>
		<h1>Infinite Canvas</h1>
		<p>Use <kbd>WASD</kbd>/<kbd>arrows</kbd> to move, <kbd>QE</kbd> for up/down, scroll to zoom, drag to pan.</p>

		<div class="comparison-controls">
			<div class="toggle-buttons">
				<button class:active={!useOGL} onclick={() => (useOGL = false)} type="button"> Three.js </button>
				<button class:active={useOGL} onclick={() => (useOGL = true)} type="button"> OGL </button>
			</div>
			<div class="stats">
				<span class="stat"><strong>Library:</strong> {useOGL ? 'OGL (29kb)' : 'Three.js (~500kb)'}</span>
				<span class="stat"><strong>FPS:</strong> {fps}</span>
			</div>
		</div>
	</header>
	<section>
		{#if useOGL}
			{#key 'ogl'}
				<InfiniteCanvasOGL {media} onclick={handleClick} />
			{/key}
		{:else}
			{#key 'threejs'}
				<InfiniteCanvas {media} onclick={handleClick} />
			{/key}
		{/if}
	</section>
</article>

<style>
	article {
		flex-direction: column;
	}
	header {
		padding: 0.5rem;
	}
	section {
		flex: 1;
		min-height: 0;
	}

	.comparison-controls {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.toggle-buttons {
		display: flex;
		gap: 0.25rem;
		border: 1px solid var(--gray-6);
		border-radius: 4px;
		overflow: hidden;
	}

	.toggle-buttons button {
		padding: 0.35rem 0.75rem;
		background: var(--gray-2);
		border: none;
		cursor: pointer;
		font-size: var(--font-2);
		transition: all 0.15s;
	}

	.toggle-buttons button:hover {
		background: var(--gray-3);
	}

	.toggle-buttons button.active {
		background: var(--accent-9);
		color: white;
	}

	.stats {
		display: flex;
		gap: 1rem;
		font-size: var(--font-2);
	}

	.stat {
		padding: 0.35rem 0.75rem;
		background: var(--gray-2);
		border-radius: 4px;
	}
</style>
