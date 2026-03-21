<script>
	import CoverFlip from '$lib/components/cover-flip.svelte'
	import {DECK_ACCENTS} from '$lib/app-state.svelte'
	import {onMount} from 'svelte'

	function makeItems(count) {
		return Array.from({length: count}, (_, i) => ({
			label: `Item ${i + 1}`,
			color: DECK_ACCENTS[i % DECK_ACCENTS.length]
		}))
	}

	let itemCount = $state(12)
	let scrollItemsPerNotch = $state(1)
	let orientation = $state(/** @type {'vertical' | 'horizontal'} */ ('vertical'))
	let items = $derived(makeItems(itemCount))

	let guiContainer = $state()

	onMount(() => {
		/** @type {import('lil-gui').GUI | undefined} */
		let gui
		import('lil-gui').then(({GUI}) => {
			const params = {items: itemCount, scrollItemsPerNotch, orientation}
			gui = new GUI({title: 'CoverFlip', container: guiContainer, autoPlace: false})
			gui.add(params, 'items', 1, 30, 1).onChange((v) => (itemCount = v))
			gui
				.add(params, 'scrollItemsPerNotch', 0.25, 5, 0.25)
				.onChange((v) => (scrollItemsPerNotch = v))
			gui.add(params, 'orientation', ['vertical', 'horizontal']).onChange((v) => (orientation = v))
		})
		return () => gui?.destroy()
	})
</script>

<svelte:head>
	<title>CoverFlip — r5 docs</title>
</svelte:head>

<h1>CoverFlip</h1>
<div class="cover-flip-demo">
	<p><small>Scroll or drag to flip through items. Click an item to jump to it.</small></p>

	<div class="gui" bind:this={guiContainer}></div>

	<div class="demo-panel">
		{#key `${orientation}-${itemCount}`}
			<CoverFlip {items} {orientation} {scrollItemsPerNotch}>
				{#snippet item({item: d, active})}
					<div class="swatch" class:active style:background={d.color}>
						{d.label}
					</div>
				{/snippet}
				{#snippet active({item: d, index})}
					<div class="active-info">
						<strong>{d.label}</strong> — index {index}
					</div>
				{/snippet}
			</CoverFlip>
		{/key}
	</div>
</div>

<style>
	.cover-flip-demo {
		margin-top: 1rem;
	}
	.demo-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-block: 2rem;
	}

	.demo-panel :global(.CoverFlip) {
		height: 50vh;
		border: 3px dashed red;
	}
	.demo-panel :global(.CoverFlip-item) {
		border: 1px dashed blue;
	}
	.demo-panel :global(.CoverFlip--horizontal) {
		width: 80%;
		height: 20vh;
	}
	.swatch {
		width: 200px;
		height: 200px;
		border-radius: var(--border-radius);
		display: grid;
		place-items: center;
		color: white;
		font-weight: bold;
		opacity: 0.9;
		scale: 0.9;
		transition:
			opacity 0.2s,
			scale 0.2s;
	}
	.swatch.active {
		opacity: 1;
		scale: 1;
	}
	.active-info {
		text-align: center;
	}
</style>
