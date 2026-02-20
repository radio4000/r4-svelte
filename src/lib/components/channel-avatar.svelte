<script>
	import {channelAvatarUrl} from '$lib/utils'
	/* keep 250 please, since it is what cloudinary has already generated */
	let {id, alt = '', size = 250} = $props()
</script>

{#if id}
	<img loading="lazy" src={channelAvatarUrl(id, size)} {alt} />
{:else}
	<img loading="lazy" src="/placeholder.png" {alt} />
{/if}

<style>
	img {
		width: 100%;
		max-width: 100%;
		border-radius: var(--media-radius);
		flex: 1;
		aspect-ratio: 1;
	}
</style>
