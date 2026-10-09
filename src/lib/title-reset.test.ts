import {describe, expect, it} from 'vitest'
import {mergeTitleUndo, titleResets, undoableTitles} from './title-reset'
import type {TrackWithMeta} from '$lib/types'

const track = (id: string, title: string, ytTitle?: unknown) =>
	({id, title, youtube_data: ytTitle === undefined ? undefined : {title: ytTitle}}) as TrackWithMeta

describe('titleResets', () => {
	it('swaps custom titles for the video title and remembers the old one', () => {
		expect(
			titleResets([
				track('a', 'my edit', 'Artist - Song (Official Video)'),
				track('b', 'Same', 'Same'),
				track('c', 'no meta'),
				track('d', 'blank', '  '),
				track('e', 'odd', 42)
			])
		).toEqual([{id: 'a', title: 'Artist - Song (Official Video)', previous: 'my edit'}])
	})
})

describe('mergeTitleUndo', () => {
	it('keeps the first reset when a second one touches other tracks', () => {
		const first = [{id: 'a', title: 'A video', previous: 'a custom'}]
		const second = [{id: 'b', title: 'B video', previous: 'b custom'}]
		expect(mergeTitleUndo(first, second)).toEqual([...first, ...second])
	})

	it('remembers the original title when a track is reset twice', () => {
		const first = [{id: 'a', title: 'old video', previous: 'a custom'}]
		const second = [{id: 'a', title: 'new video', previous: 'old video'}]
		expect(mergeTitleUndo(first, second)).toEqual([
			{id: 'a', title: 'new video', previous: 'a custom'}
		])
	})

	it('remembers a hand edit made between two resets', () => {
		const first = [{id: 'a', title: 'video', previous: 'a custom'}]
		const second = [{id: 'a', title: 'video', previous: 'hand edit'}]
		expect(mergeTitleUndo(first, second)).toEqual([
			{id: 'a', title: 'video', previous: 'hand edit'}
		])
	})

	it('drops a track whose reset lands back on its original title', () => {
		const first = [{id: 'a', title: 'old video', previous: 'Song'}]
		const second = [{id: 'a', title: 'Song', previous: 'old video'}]
		expect(mergeTitleUndo(first, second)).toEqual([])
	})
})

describe('undoableTitles', () => {
	it('skips tracks edited or deleted since the reset', () => {
		const changes = [
			{id: 'a', title: 'video', previous: 'a custom'},
			{id: 'b', title: 'video', previous: 'b custom'},
			{id: 'c', title: 'video', previous: 'c custom'}
		]
		const current: Record<string, string> = {a: 'video', b: 'hand edit'}
		expect(undoableTitles(changes, (id) => current[id])).toEqual([changes[0]])
	})
})
