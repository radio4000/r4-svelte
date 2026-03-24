<script>
	import ChannelScene from '$lib/components/channel-scene-ogl.svelte'

	const r4LogoDataUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260"><rect width="300" height="260" rx="26" fill="#0e131b"/><g fill="#f5f7fb"><path d="M125 217.53h108.86V260h40.19l-.005-42.47H300v-39.887h-25.955V38.147h-64.868L125 177.597v39.934zm34.215-40.066l87.847-70.16v70.16h-87.847z"/><path d="M0 184.71h32.246v-75.302h42.91l50.088 75.302h24.554l-51.726-78.633c33.72-3.96 58.928-20.32 58.928-52.51C157 16.36 127.863 0 81.376 0H0v184.71zm15.156-91.56V50.796h53.627c27.23 0 47.792 5.052 47.792 21.25S94.068 93.15 69.34 93.15H15.155z"/></g></svg>')}`
	const logoMedia = [
		{
			url: r4LogoDataUrl,
			width: 300,
			height: 260,
			id: 'r4-logo-debug',
			slug: 'radio4000',
			name: 'Radio4000',
			description: '',
			tags: [],
			mentions: [],
			activeTags: [],
			activeMentions: [],
			channel: {track_count: 0, updated_at: new Date().toISOString()}
		}
	]
</script>

<svelte:head>
	<title>3D | r5 docs</title>
</svelte:head>

<article class="fill-height">
	<header>
		<menu class="nav-grouped">
			<a href="/docs/3d/scene-infinite">scene-infinite</a>
			<a href="/docs/3d/scene-single">scene-single</a>
		</menu>
	</header>
	<section class="scene">
		<ChannelScene
			media={logoMedia}
			allowNavigation={false}
			enableCardTilt={false}
			singleSceneConstrainMovement={true}
			singleSceneCardDragRotate={true}
			singleSceneMouseDrift={false}
		/>
	</section>
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
	}
	.scene {
		flex: 1;
		min-height: 0;
	}
</style>
