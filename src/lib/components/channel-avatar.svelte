<script>
	import {channelAvatarUrl} from '$lib/utils'
	/* keep 250 please, since it is what cloudinary has already generated */
	let {id, alt = '', size = 250} = $props()
</script>

{#if id}
	<img loading="lazy" src={channelAvatarUrl(id, size)} {alt} />
{:else}
	<!-- <img loading="lazy" src={`base64,${btoa('ba')}`} {alt} /> -->
	<div class="placeholder">{alt.slice(0, 2) || '?'}</div>
{/if}

<style>
	img,
	.placeholder {
		width: 100%;
		max-width: 100%;
		border-radius: var(--media-radius);
		flex: 1;
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray-4);
		color: var(--gray-7);
		font-size: var(--font-7);
		text-transform: uppercase;
	}
</style>
