<script lang="ts">
	import {channelAvatarUrl} from '$lib/utils'
	import Icon from '$lib/components/icon.svelte'
	/* keep 250 please, since it is what cloudinary has already generated */
	let {id, alt = '', size = 250}: {id?: string | null; alt?: string | null; size?: number} = $props()

	let loaded = $state(false)
</script>

{#if id}
	<img loading="lazy" src={channelAvatarUrl(id, size)} {alt} class:loaded onload={() => (loaded = true)} />
{:else}
	<span class="fallback" role={alt ? 'img' : undefined} aria-label={alt || undefined}>
		<Icon icon="user" />
	</span>
{/if}

<style>
	img,
	.fallback {
		width: 100%;
		max-width: 100%;
		border-radius: var(--media-radius);
		flex: 1;
		aspect-ratio: 1;
	}

	img:not(.loaded) {
		background: linear-gradient(
			110deg,
			var(--gray-3) 30%,
			var(--gray-4) 50%,
			var(--gray-3) 70%
		);
		background-size: 200% 100%;
		animation: wave 2.4s ease-in-out infinite;
	}

	@keyframes wave {
		0% {
			background-position: 150% 0;
		}
		100% {
			background-position: -50% 0;
		}
	}

	.fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gray-3);
		color: var(--gray-11);
	}

	.fallback :global(svg) {
		width: 55%;
		height: 55%;
	}
</style>
