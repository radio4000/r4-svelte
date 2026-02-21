<script>
	import {page} from '$app/state'
	import {channelsCollection} from '$lib/tanstack/collections'
	import {channelAvatarUrl} from '$lib/utils'

	let slug = $derived(page.params.slug)
	let channel = $derived([...channelsCollection.state.values()].find((c) => c.slug === slug))
</script>

{#if channel?.image}
	<div class="image-page">
		<a href="/{slug}">
			<img src={channelAvatarUrl(channel.image, 250)} alt={channel.name} />
		</a>
	</div>
{/if}

<style>
	.image-page {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		height: 100%;
	}

	a {
		display: block;
		max-width: min(100%, 400px);
		width: 100%;
	}

	img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		border-radius: var(--media-radius);
	}
</style>
