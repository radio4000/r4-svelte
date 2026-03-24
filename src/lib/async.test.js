import {expect, test} from 'vitest'
import {mapChunked} from './async.js'

test('basic chunking and concurrency', async () => {
	const items = [1, 2, 3, 4, 5]
	const results = []

	for await (const result of mapChunked(items, async (chunk) => chunk.map((x) => x * 2), {
		chunk: 2
	})) {
		results.push(result)
	}

	expect(results.length).toBe(3) // 5 items / chunk 2 = 3 chunks
	expect(results.every((r) => r.ok)).toBe(true)

	const values = results.flatMap((r) => r.value)
	expect(values.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10])
})

test('respects concurrency limit', async () => {
	let maxConcurrent = 0
	let currentConcurrent = 0

	const items = Array.from({length: 10}, (_, i) => i)

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for await (const _ of mapChunked(
		items,
		async (chunk) => {
			currentConcurrent++
			maxConcurrent = Math.max(maxConcurrent, currentConcurrent)
			await new Promise((r) => setTimeout(r, 5))
			currentConcurrent--
			return chunk
		},
		{chunk: 1, concurrency: 3}
	)) {
		// consume results
	}

	expect(maxConcurrent).toBeLessThanOrEqual(3)
})

test('handles errors gracefully', async () => {
	const items = [1, 2, 3]
	const results = []

	for await (const result of mapChunked(
		items,
		async (chunk) => {
			if (chunk[0] === 2) throw new Error('fail')
			return chunk
		},
		{chunk: 1}
	)) {
		results.push(result)
	}

	expect(results.length).toBe(3)
	const successes = results.filter((r) => r.ok)
	const failures = results.filter((r) => !r.ok)
	expect(successes.length).toBe(2)
	expect(failures.length).toBe(1)
	expect(failures[0].error.message).toBe('fail')
})

test('empty items array', async () => {
	const results = []
	for await (const result of mapChunked([], async (chunk) => chunk)) {
		results.push(result)
	}
	expect(results).toEqual([])
})

test('abort signal stops processing', async () => {
	const controller = new AbortController()
	const items = Array.from({length: 20}, (_, i) => i)
	const results = []
	let processedChunks = 0

	for await (const result of mapChunked(
		items,
		async (chunk) => {
			processedChunks++
			await new Promise((r) => setTimeout(r, 10))
			if (processedChunks === 3) controller.abort()
			return chunk
		},
		{chunk: 1, concurrency: 2, signal: controller.signal}
	)) {
		results.push(result)
	}

	// Should have stopped before processing all 20 chunks
	expect(processedChunks).toBeLessThan(20)
	// Should have abort errors for remaining chunks
	const abortErrors = results.filter((r) => !r.ok && r.error.name === 'AbortError')
	expect(abortErrors.length).toBeGreaterThan(0)
})

test('youtube metadata batch scenario - 3k tracks', async () => {
	const TRACK_COUNT = 3000
	const API_BATCH_SIZE = 50
	const CONCURRENCY = 3

	const ytids = Array.from({length: TRACK_COUNT}, (_, i) => `yt_${String(i).padStart(5, '0')}`)

	const trackStore = new Map()
	const metaStore = new Map()
	let apiCalls = 0
	let maxConcurrent = 0
	let currentConcurrent = 0

	const fetchYouTubeMeta = async (batch) => {
		apiCalls++
		currentConcurrent++
		maxConcurrent = Math.max(maxConcurrent, currentConcurrent)

		await new Promise((r) => setTimeout(r, Math.random() * 5 + 1))
		currentConcurrent--

		if (Math.random() < 0.03) throw new Error('rate limit')

		return batch
			.map((id) => {
				if (Math.random() < 0.02) return null
				return {
					id,
					title: `Video ${id}`,
					duration: Math.floor(Math.random() * 600) + 30
				}
			})
			.filter(Boolean)
	}

	const start = performance.now()

	for await (const result of mapChunked(ytids, fetchYouTubeMeta, {
		chunk: API_BATCH_SIZE,
		concurrency: CONCURRENCY
	})) {
		if (!result.ok) continue
		for (const video of result.value) {
			metaStore.set(video.id, video)
			trackStore.set(video.id, {duration: video.duration})
		}
	}

	const elapsed = performance.now() - start

	console.log(`\n--- mapChunked YouTube Test ---`)
	console.log(`Tracks: ${TRACK_COUNT}, API calls: ${apiCalls}, max concurrent: ${maxConcurrent}`)
	console.log(`Fetched: ${metaStore.size} videos, Time: ${elapsed.toFixed(0)}ms`)

	expect(apiCalls).toBe(60) // 3000 / 50
	expect(maxConcurrent).toBeLessThanOrEqual(CONCURRENCY)
	expect(metaStore.size).toBeGreaterThan(TRACK_COUNT * 0.9)
})
