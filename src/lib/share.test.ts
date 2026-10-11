import {afterEach, describe, expect, test, vi} from 'vitest'
import {nativeShare} from './share'

vi.mock('$app/paths', () => ({resolve: (path: string) => path}))
vi.mock('$lib/config', () => ({
	appUrl: 'https://radio4000.com',
	appPlayerUrl: 'https://player.radio4000.com'
}))

afterEach(() => vi.unstubAllGlobals())

const data = {title: 'Track', url: 'https://radio4000.com/test/tracks/one'}

describe('native sharing', () => {
	test('can share the same track repeatedly', async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('navigator', {share})
		expect(await nativeShare(data)).toBe(true)
		expect(await nativeShare(data)).toBe(true)
		expect(share).toHaveBeenCalledTimes(2)
	})

	test('cancellation allows another attempt', async () => {
		vi.stubGlobal('navigator', {
			share: vi
				.fn()
				.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
				.mockResolvedValueOnce(undefined)
		})
		expect(await nativeShare(data)).toBe(false)
		expect(await nativeShare(data)).toBe(true)
	})

	test('reports a failed share and allows a retry', async () => {
		const error = new DOMException('Share already in progress', 'InvalidStateError')
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined)
		})
		await expect(nativeShare(data)).rejects.toBe(error)
		expect(await nativeShare(data)).toBe(true)
	})

	test('reports synchronous failures through the same promise', async () => {
		const error = new TypeError('Invalid share data')
		vi.stubGlobal('navigator', {
			share: () => {
				throw error
			}
		})
		await expect(nativeShare(data)).rejects.toBe(error)
	})

	test('returns false when native sharing is unavailable', async () => {
		vi.stubGlobal('navigator', {})
		expect(await nativeShare(data)).toBe(false)
	})
})
