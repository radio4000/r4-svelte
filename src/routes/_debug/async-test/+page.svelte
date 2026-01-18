<script>
	import {mapChunked} from '$lib/async'
	import BatchProgress from '$lib/components/batch-progress.svelte'
	import {delayRandom, delayWithJitter} from '$lib/utils'

	/**
	 * @typedef {'queued' | 'fetching' | 'saving' | 'done' | 'error'} BatchStatus
	 * @typedef {{id: number, status: BatchStatus, start: number, end: number, startTime?: number, endTime?: number, error?: string}} Batch
	 */

	// Config — defaults tuned for nice visualization
	let trackCount = $state(120)
	let chunkSize = $state(20)
	let concurrency = $state(3)
	let minDelay = $state(3000)
	let maxDelay = $state(5000)
	let errorRate = $state(0.05)

	// State
	let running = $state(false)
	let elapsed = $state(0)
	/** @type {Batch[]} */
	let batches = $state([])
	/** @type {AbortController | null} */
	let abortController = $state(null)
	let startTime = $state(0)
	/** @type {ReturnType<typeof setInterval> | null} */
	let timerInterval = $state(null)

	async function runTest() {
		if (running) return

		running = true
		elapsed = 0
		batches = []
		abortController = new AbortController()
		startTime = performance.now()

		// Start elapsed timer
		timerInterval = setInterval(() => {
			elapsed = (performance.now() - startTime) / 1000
		}, 100)

		// Create fake track IDs
		const trackIds = Array.from({length: trackCount}, (_, i) => `track_${String(i).padStart(4, '0')}`)

		// Pre-create batch entries
		const totalBatches = Math.ceil(trackIds.length / chunkSize)
		for (let i = 0; i < totalBatches; i++) {
			const start = i * chunkSize
			const end = Math.min(start + chunkSize - 1, trackIds.length - 1)
			batches.push({id: i, status: 'queued', start, end})
		}

		let batchIndex = 0

		try {
			for await (const result of mapChunked(
				trackIds,
				async (chunk, signal) => {
					const myBatchIndex = batchIndex++
					const batch = batches[myBatchIndex]

					// Mark fetching
					batch.status = 'fetching'
					batch.startTime = performance.now()

					// Simulate API call with random delay
					await delayRandom(minDelay, maxDelay)

					if (signal?.aborted) {
						throw new DOMException('Aborted', 'AbortError')
					}

					// Random error
					if (Math.random() < errorRate) {
						throw new Error('Simulated API error')
					}

					// Mark saving
					batch.status = 'saving'

					// Simulate DB write
					await delayWithJitter(100, 0.5)

					return {
						batchIndex: myBatchIndex,
						items: chunk.map((id) => ({id, duration: Math.floor(Math.random() * 300) + 60}))
					}
				},
				{chunk: chunkSize, concurrency, signal: abortController.signal}
			)) {
				if (result.ok) {
					const batch = batches[result.value.batchIndex]
					batch.endTime = performance.now()
					batch.status = 'done'
				} else {
					// For errors, find the batch that's still fetching/saving
					const batch = batches.find((b) => b.status === 'fetching' || b.status === 'saving')
					if (batch) {
						batch.endTime = performance.now()
						batch.status = 'error'
						batch.error = result.error.message
					}
				}
			}
		} finally {
			clearInterval(timerInterval)
			elapsed = (performance.now() - startTime) / 1000
			running = false
			abortController = null
		}
	}

	function abort() {
		abortController?.abort()
	}
</script>

<svelte:head>
	<title>Async Test | Playground</title>
</svelte:head>

<div class="constrained">
	<menu data-grouped>
		<a href="/_debug">&larr;</a>
	</menu>
	<h1>Async Test</h1>
	<BatchProgress total={trackCount} {chunkSize} chunks={batches} {elapsed} {running} onRun={runTest} onAbort={abort}>
		{#snippet controls()}
			<label>
				Items
				<input type="number" bind:value={trackCount} min="10" max="1000" step="10" />
			</label>
			<label>
				Chunk
				<input type="number" bind:value={chunkSize} min="5" max="100" step="5" />
			</label>
			<label>
				Concurrency
				<input type="number" bind:value={concurrency} min="1" max="10" />
			</label>
			<label>
				Min ms
				<input type="number" bind:value={minDelay} min="0" max="5000" step="100" />
			</label>
			<label>
				Max ms
				<input type="number" bind:value={maxDelay} min="0" max="5000" step="100" />
			</label>
			<label>
				Error %
				<input type="number" bind:value={errorRate} min="0" max="1" step="0.05" />
			</label>
		{/snippet}
	</BatchProgress>
</div>
