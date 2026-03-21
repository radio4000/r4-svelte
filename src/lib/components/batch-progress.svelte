<script>
	/**
	 * @typedef {'queued' | 'fetching' | 'saving' | 'done' | 'error'} ChunkStatus
	 * @typedef {{id: number, status: ChunkStatus}} Chunk
	 */

	/** @type {{total: number, chunkSize?: number, chunks?: Chunk[], elapsed?: number, running?: boolean, onRun?: () => void, onAbort?: () => void, controls?: import('svelte').Snippet}} */
	let {
		total,
		chunkSize = 50,
		chunks = [],
		elapsed = 0,
		running = false,
		onRun,
		onAbort,
		controls
	} = $props()

	let chunkCount = $derived(Math.ceil(total / chunkSize))
	let lastChunkSize = $derived(total % chunkSize || chunkSize)
	let isDone = $derived(
		chunks.length > 0 &&
			!running &&
			chunks.every((c) => c.status === 'done' || c.status === 'error')
	)

	// Count completed items based on done chunks
	let completedItems = $derived.by(() => {
		let count = 0
		for (let i = 0; i < chunkCount; i++) {
			if (chunks[i]?.status === 'done') {
				count += i === chunkCount - 1 ? lastChunkSize : chunkSize
			}
		}
		return count
	})

	let elapsedStr = $derived(
		elapsed < 60
			? `${elapsed.toFixed(1)}s`
			: `${Math.floor(elapsed / 60)}m ${(elapsed % 60).toFixed(0)}s`
	)

	/** @param {MouseEvent & {currentTarget: HTMLButtonElement}} e */
	function handleAbort(e) {
		e.currentTarget.disabled = true
		e.currentTarget.textContent = 'Aborting...'
		onAbort?.()
	}

	function getStatus(i) {
		return chunks[i]?.status || 'queued'
	}
</script>

<article class="chunk-progress">
	<header>
		<span>
			{#if running || isDone}
				{completedItems}/{total} items
			{:else}
				{total} items → {chunkCount} chunks of {chunkSize}
			{/if}
		</span>
		{#if running || isDone}
			<span class="elapsed">
				{running ? '…' : '✓'}
				{elapsedStr}
			</span>
		{/if}
	</header>

	<section class="chunks">
		{#each {length: chunkCount}, i (i)}
			{@const status = getStatus(i)}
			{@const size = i === chunkCount - 1 ? lastChunkSize : chunkSize}
			<div
				class="chunk"
				class:queued={status === 'queued'}
				class:fetching={status === 'fetching'}
				class:saving={status === 'saving'}
				class:done={status === 'done'}
				class:error={status === 'error'}
				title="{size} items"
			>
				{#if status === 'fetching' || status === 'saving'}
					…
				{:else if status === 'done'}
					{size}
				{:else if status === 'error'}
					✗
				{/if}
			</div>
		{/each}
	</section>

	<footer>
		{#if onRun}
			<button onclick={onRun} disabled={running}>{isDone ? '▶ Run again' : '▶ Run'}</button>
		{/if}
		{#if running && onAbort}
			<button class="abort" onclick={handleAbort}>Abort</button>
		{/if}
	</footer>

	{#if controls && !running}
		<menu class="controls">
			{@render controls()}
		</menu>
	{/if}
</article>

<style>
	.chunk-progress {
		border: 1px solid var(--gray-6);
		border-radius: var(--border-radius);
		padding: var(--space-2);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 720px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}

	.elapsed {
		opacity: 0.6;
	}

	.chunks {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.chunk {
		height: 1.25rem;
		width: 1.25rem;
		border-radius: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-0);
		background: var(--gray-1);
		border: 1px solid var(--gray-6);
		color: var(--gray-6);
	}

	.chunk.fetching,
	.chunk.saving {
		border-color: var(--gray-12);
	}

	.chunk.done {
		background: var(--gray-12);
		border-color: var(--gray-12);
		color: var(--gray-1);
	}

	.chunk.error {
		border-color: #c00;
		color: #c00;
	}

	footer {
		display: flex;
		gap: var(--space-2);
	}

	footer button {
		padding: var(--space-1) var(--space-2);
		cursor: pointer;
		border-radius: var(--border-radius);
	}

	.abort:hover {
		background: #c00;
		color: var(--gray-1);
		border-color: #c00;
	}

	.controls {
		border-top: 1px solid var(--gray-6);
		padding-top: var(--space-2);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.controls :global(label) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--font-1);
	}

	.controls :global(input) {
		width: 70px;
	}
</style>
