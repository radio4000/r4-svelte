<script>
	import CoverFlip from '$lib/components/cover-flip.svelte'

	const colors = [
		'#e74c3c',
		'#e67e22',
		'#f1c40f',
		'#2ecc71',
		'#1abc9c',
		'#3498db',
		'#9b59b6',
		'#e91e63',
		'#00bcd4',
		'#8bc34a',
		'#ff5722',
		'#607d8b'
	]

	const items = colors.map((color, i) => ({
		label: `Item ${i + 1}`,
		color
	}))

	/** @type {{title: string, orientation: 'vertical' | 'horizontal'}[]} */
	const demos = [
		{title: 'Vertical', orientation: 'vertical'},
		{title: 'Horizontal', orientation: 'horizontal'}
	]
</script>

<svelte:head>
	<title>CoverFlip — Debug</title>
</svelte:head>

<div class="container">
	<h1>CoverFlip</h1>
	<p><small>Scroll or drag to flip through items. Click an item to jump to it.</small></p>

	<div class="demo-grid">
		{#each demos as demo (demo.orientation)}
			<div class="demo-panel">
				<h2>{demo.title}</h2>
				<CoverFlip {items} orientation={demo.orientation}>
					{#snippet item({item: d, active})}
						<div
							class="swatch"
							style:background={d.color}
							style:opacity={active ? 1 : 0.4}
							style:scale={active ? 1.2 : 1}
						>
							{d.label}
						</div>
					{/snippet}
					{#snippet active({item: d, index})}
						<div class="active-info">
							<strong>{d.label}</strong> — index {index}
							<div class="swatch-preview" style:background={d.color}></div>
						</div>
					{/snippet}
				</CoverFlip>
			</div>
		{/each}
	</div>
</div>

<style>
	.demo-grid {
		margin-block: 2rem;
		display: grid;
		gap: 2rem;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	}

	.demo-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.swatch {
		width: 120px;
		height: 120px;
		border-radius: var(--border-radius);
		display: grid;
		place-items: center;
		color: white;
		font-weight: bold;
		transition:
			opacity 0.2s,
			scale 0.2s;
	}
	.active-info {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.swatch-preview {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
	}
</style>
