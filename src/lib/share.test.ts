import {afterEach, describe, expect, test, vi} from 'vitest'

vi.mock('$app/paths', () => ({resolve: (path: string) => path}))
vi.mock('$lib/config', () => ({
	appUrl: 'https://radio4000.com',
	appPlayerUrl: 'https://player.radio4000.com'
}))

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

const data = {title: 'Track', url: 'https://radio4000.com/test/tracks/one'}
const stuck = () => new DOMException('Only one share picker at a time', 'InvalidStateError')

/** A fake DOM whose iframes each get their own navigator.share. */
function stubDom(frameShare: () => Promise<void>) {
	const frames: {isConnected: boolean; remove: () => void; share: ReturnType<typeof vi.fn>}[] = []
	vi.stubGlobal('document', {
		createElement: () => {
			const share = vi.fn(frameShare)
			const frame = {
				hidden: false,
				isConnected: false,
				share,
				contentWindow: {navigator: {share}},
				remove: () => (frame.isConnected = false)
			}
			frames.push(frame)
			return frame
		},
		body: {append: (frame: {isConnected: boolean}) => (frame.isConnected = true)}
	})
	return frames
}

async function load() {
	return (await import('./share')).nativeShare
}

describe('native sharing', () => {
	test('shares repeatedly when the browser settles each share', async () => {
		const frames = stubDom(() => Promise.resolve())
		const share = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal('navigator', {share})
		const nativeShare = await load()
		expect(await nativeShare(data)).toBe(true)
		expect(await nativeShare(data)).toBe(true)
		expect(share).toHaveBeenCalledTimes(2)
		expect(frames.every((f) => !f.isConnected)).toBe(true)
	})

	test('reopens through a spare iframe when a dismissed share never settles', async () => {
		const frames = stubDom(() => new Promise(() => {}))
		const share = vi
			.fn()
			.mockReturnValueOnce(new Promise(() => {}))
			.mockRejectedValue(stuck())
		vi.stubGlobal('navigator', {share})
		const nativeShare = await load()

		void nativeShare(data)
		await Promise.resolve()
		expect(frames).toHaveLength(1)

		void nativeShare({...data, title: 'Other track'})
		await vi.waitFor(() =>
			expect(frames[0].share).toHaveBeenCalledWith({...data, title: 'Other track'})
		)
		expect(frames[1].isConnected).toBe(true)

		void nativeShare(data)
		await vi.waitFor(() => expect(frames[1].share).toHaveBeenCalled())
		expect(frames[0].isConnected).toBe(false)
	})

	test('cancelling returns false', async () => {
		stubDom(() => Promise.resolve())
		vi.stubGlobal('navigator', {
			share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
		})
		expect(await (await load())(data)).toBe(false)
	})

	test('returns false when native sharing is unavailable', async () => {
		vi.stubGlobal('navigator', {})
		expect(await (await load())(data)).toBe(false)
	})
})
