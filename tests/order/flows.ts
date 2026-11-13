// Scripted flows for the order test: walks that need a check of their own, because "the page
// shows what it showed cold" cannot be the test (an import does not survive a reload, a
// queue has no URL, a track you just added has no cold twin to compare with).
//
// Each flow drives one fresh browser context like a user would (link clicks, forms, a real
// tap to play) and reports `fails` (something that must hold, did not) and `notes` (something
// to record, not a failure). order.ts runs every flow once per run and merges the results into
// the same findings list as the cold-versus-walk comparison.
//
//   read-only, signed out:   queue-filter-next, big-channel-4000
//   behind --signed-in:      import-m3u (local only, writes to the browser, never to the
//                            server), owner-add-edit-delete and feed-network (sign in as the
//                            robot with R4_ROBOT_EMAIL and R4_ROBOT_PASSWORD from .env.local)
//
// Gotchas that cost time: a new deck is a compact bar whose queue has no rows (tap
// `button.expand` first); `[data-deck]` does not wrap that bar; the robot follows nobody, so the
// feed flow follows two recently active channels through the Follow button and unfollows them
// in `finally`; `channels_with_tracks` sorts null `latest_track_at` first, so filter them out.
// `ORDER_DEBUG=1` prints what each check saw.
//
// The robot flow writes to production, to /robot-afterhours only, with titles that start
// with `orderwalk `. It sweeps such tracks before it starts and in `finally`, so a failed
// walk, or a failed run, does not leave any behind.

/* eslint-disable @typescript-eslint/no-explicit-any -- the pages are untyped */

export type FlowPage = {
	send(method: string, params?: object): Promise<any>
	evaluate<T = any>(expression: string): Promise<T>
	close(): Promise<unknown>
}
export type FlowShot = {
	url: string
	tracks: string[]
	channels: string[]
	tags: string[]
	claims: string[]
	loading: boolean
	settled: boolean
	stable: boolean
}
export type Kit = {
	open(): Promise<FlowPage>
	act(
		page: FlowPage,
		action: ['load' | 'go' | 'back' | 'forward' | 'reload' | 'play', string?]
	): Promise<unknown>
	settle(page: FlowPage): Promise<boolean>
	shoot(page: FlowPage): Promise<FlowShot>
}
export type Fail = {step: string; path: string; detail: string}
export type Result = {fails: Fail[]; notes: Fail[]}
export type Flow = {
	name: string
	why: string
	/** Needs the robot's credentials or writes locally: only with --signed-in */
	flag: 'default' | 'signed-in'
	run(kit: Kit): Promise<Result>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const OWNER = 'robot-afterhours'

// --- page helpers -----------------------------------------------------------------

/** Track rows in the page's main area (not the deck), id and text. */
const ROWS = `(() => {
	const main = document.querySelector('main') || document.body
	const outside = (e) => !e.closest('[data-deck], .player, aside, dialog, header.app')
	return [...main.querySelectorAll('[data-track-id], article.track-card')]
		.filter((e) => outside(e) && !(e.matches('article') && e.closest('[data-track-id]')))
		.map((e) => ({id: e.dataset.trackId || null, text: e.textContent.replace(/\\s+/g, ' ').trim()}))
})()`

type Row = {id: string | null; text: string}

const json = JSON.stringify

function flowCtx(kit: Kit) {
	const result: Result = {fails: [], notes: []}
	const check = (step: string, path: string, ok: boolean, detail: string) => {
		if (!ok) result.fails.push({step, path, detail})
	}
	const note = (step: string, path: string, detail: string) =>
		result.notes.push({step, path, detail})

	const rows = (page: FlowPage) => page.evaluate<Row[]>(ROWS)
	/** Settle and read the rows until `ok` holds; three tries a second apart, so a transient is not a failure. */
	async function until(page: FlowPage, ok: (rows: Row[]) => boolean) {
		let seen: Row[] = []
		for (let i = 0; i < 3; i++) {
			await kit.settle(page)
			seen = await rows(page)
			if (process.env.ORDER_DEBUG)
				console.log('   ', await page.evaluate('location.pathname + location.search'), sample(seen))
			if (ok(seen)) return {ok: true, seen}
			await sleep(1000)
		}
		return {ok: false, seen}
	}
	const sample = (seen: Row[]) =>
		`${seen.length} rows${
			seen.length
				? ` (${seen
						.slice(0, 2)
						.map((r) => r.text.slice(0, 40))
						.join(' | ')})`
				: ''
		}`
	/** Visit a path by link click and expect the rows to satisfy `ok`. */
	async function visit(
		page: FlowPage,
		step: string,
		path: string,
		expectation: string,
		ok: (rows: Row[]) => boolean
	) {
		await kit.act(page, ['go', path])
		const {ok: good, seen} = await until(page, ok)
		check(step, path, good, `${expectation}; shows ${sample(seen)}`)
		return seen
	}
	/** A bare full load of the site, then a page script, in the same context. */
	const hasText = (token: string) => (seen: Row[]) => seen.some((r) => r.text.includes(token))
	const lacksText = (token: string) => (seen: Row[]) => !seen.some((r) => r.text.includes(token))
	return {result, check, note, rows, until, sample, visit, hasText, lacksText}
}

/** In-page state that the flows read: deck, collection and channel counts. */
const state = <T>(page: FlowPage, js: string) => page.evaluate<T>(`(async () => { ${js} })()`)

/** Type into a field the way a user would, so the form's bound value follows. */
const fill = (page: FlowPage, selector: string, value: string) =>
	page.evaluate(`(() => {
		const el = document.querySelector(${json(selector)})
		if (!el) throw new Error('no field ${selector}')
		const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
		Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${json(value)})
		el.dispatchEvent(new Event('input', {bubbles: true}))
	})()`)

const click = (page: FlowPage, selector: string) =>
	page.evaluate(`(() => {
		const el = document.querySelector(${json(selector)})
		if (!el) throw new Error('nothing to click: ${selector}')
		el.click()
	})()`)

/** Wait for a selector to exist, up to 10s. */
const appears = (page: FlowPage, selector: string) =>
	page.evaluate<boolean>(`(async () => {
		for (let i = 0; i < 100; i++) {
			if (document.querySelector(${json(selector)})) return true
			await new Promise((r) => setTimeout(r, 100))
		}
		return false
	})()`)

async function withPage<T>(kit: Kit, fn: (page: FlowPage) => Promise<T>) {
	const page = await kit.open()
	try {
		return await fn(page)
	} finally {
		await page.close()
	}
}

// --- imported channel -------------------------------------------------------------

const M3U_TITLES = [
	'Walk Alpha',
	'Walk Bravo',
	'Walk Charlie',
	'Walk Delta',
	'Walk Echo',
	'Walk Foxtrot'
]
const M3U = [
	'#EXTM3U',
	...M3U_TITLES.flatMap((t, i) => [
		`#EXTINF:-1,${t}`,
		`https://www.youtube.com/watch?v=ordw${String(i).padStart(7, '0')}`
	])
].join('\n')

const importM3u: Flow = {
	name: 'import-m3u',
	why: 'an imported playlist keeps its tracks when you leave its channel and come back, and when you search it',
	flag: 'signed-in',
	async run(kit) {
		const c = flowCtx(kit)
		await withPage(kit, async (page) => {
			await kit.act(page, ['load', '/settings/import/m3u'])
			await kit.settle(page)
			await appears(page, 'input[type=file]')
			await page.evaluate(`(() => {
				const input = document.querySelector('input[type=file]')
				const dt = new DataTransfer()
				dt.items.add(new File([${json(M3U)}], 'order-walk-list.m3u'))
				input.files = dt.files
				input.dispatchEvent(new Event('change', {bubbles: true}))
			})()`)
			const link = await page.evaluate<string | null>(`(async () => {
				for (let i = 0; i < 100; i++) {
					const a = [...document.querySelectorAll('article a')].find((a) => /^\\/order-walk-list/.test(a.getAttribute('href') || ''))
					if (a) return a.getAttribute('href')
					await new Promise((r) => setTimeout(r, 100))
				}
				return null
			})()`)
			if (!link) {
				c.check('import', '/settings/import/m3u', false, 'no "Browse it" link after importing')
				return
			}
			const slug = link.slice(1)
			// The reference is the state right after the import: the rows the collection holds
			const ids = await state<string[]>(
				page,
				`return [...window.r5.tracksCollection.state.values()].filter((t) => t.slug === ${json(slug)}).map((t) => t.id)`
			)
			c.check(
				'import',
				'/settings/import/m3u',
				ids.length === M3U_TITLES.length,
				`imported ${ids.length} of ${M3U_TITLES.length} tracks`
			)
			const all = (seen: Row[]) =>
				M3U_TITLES.every((t) => seen.some((r) => r.text.includes(t))) &&
				!seen.some((r) => r.id && !ids.includes(r.id))
			const shows = `all ${M3U_TITLES.length} imported tracks`

			await click(page, `article a[href="${link}"]`)
			await kit.settle(page)
			const home = await c.rows(page)
			c.check(
				'Browse it',
				link,
				M3U_TITLES.some((t) => home.some((r) => r.text.includes(t))),
				`a channel home with imported tracks; shows ${c.sample(home)}`
			)

			const tab = await page.evaluate<boolean>(
				`!!document.querySelector('.channel-tabs a[href="/${slug}/tracks"]')`
			)
			if (tab) await click(page, `.channel-tabs a[href="/${slug}/tracks"]`)
			else await kit.act(page, ['go', `/${slug}/tracks`])
			const tracks = await c.until(page, all)
			c.check(
				'Tracks tab',
				`/${slug}/tracks`,
				tracks.ok,
				`${shows}; shows ${c.sample(tracks.seen)}`
			)

			await c.visit(
				page,
				'another channel',
				'/counting',
				'the other channel',
				(seen) => seen.length > 0
			)
			await c.visit(page, 'back to the tracks', `/${slug}/tracks`, shows, all)
			await c.visit(
				page,
				'search it',
				`/${slug}/tracks?q=alpha`,
				'one row, Walk Alpha',
				(seen) => seen.length === 1 && seen[0].text.includes('Walk Alpha')
			)
			await c.visit(
				page,
				'search it, no match',
				`/${slug}/tracks?q=nothingmatchesthis`,
				'no rows',
				(seen) => seen.length === 0
			)
			await c.visit(page, 'clear the search', `/${slug}/tracks`, shows, all)
			await kit.act(page, ['go', '/counting/tracks'])
			await kit.settle(page)
			await kit.act(page, ['back'])
			const back = await c.until(page, all)
			c.check('history back', `/${slug}/tracks`, back.ok, `${shows}; shows ${c.sample(back.seen)}`)
			await c.visit(page, 'search it on the search page', `/search/tracks?q=@${slug}`, shows, all)
		})
		return c.result
	}
}

// --- the robot's own channel --------------------------------------------------------

const robot = () => {
	const {R4_ROBOT_EMAIL: email, R4_ROBOT_PASSWORD: password} = process.env
	if (!email || !password)
		throw new Error('set R4_ROBOT_EMAIL and R4_ROBOT_PASSWORD in .env.local (see AGENTS.local.md)')
	return {email, password}
}

async function signIn(kit: Kit, page: FlowPage) {
	await kit.act(page, ['load', '/'])
	await kit.settle(page)
	const error = await page.evaluate<string | null>(
		`window.r5.sdk.auth.signIn(${json(robot())}).then((r) => r.error?.message ?? null)`
	)
	if (error) throw new Error(`robot sign-in failed: ${error}`)
}

/** Delete every track the walk could have left on the robot's channel. Not via the UI. */
const sweep = (page: FlowPage) =>
	page.evaluate<number>(`(async () => {
		const {data} = await window.r5.sdk.supabase.from('channel_tracks').select('id').eq('slug', ${json(OWNER)}).like('title', 'orderwalk %')
		for (const t of data ?? []) await window.r5.sdk.tracks.deleteTrack(t.id)
		return (data ?? []).length
	})()`)

const ownerFlow: Flow = {
	name: 'owner-add-edit-delete',
	why: 'a track you add, edit and delete shows (and stops showing) the same on the channel, in its search, in a tag view and in a cross-channel search',
	flag: 'signed-in',
	async run(kit) {
		const c = flowCtx(kit)
		const token = `ow${Date.now().toString(36)}`
		const tag = `tag${token}`
		const before = `orderwalk ${token} first`
		const after = `orderwalk ${token} second`
		const slug = OWNER
		const views = (title: string, other: string, step: string, page: FlowPage, present: boolean) =>
			(async () => {
				const want = present ? c.hasText(title) : c.lacksText(title)
				const word = present ? `shows "${title}"` : `no longer shows "${title}"`
				await c.visit(page, `${step}: on the channel`, `/${slug}/tracks`, word, want)
				await c.visit(
					page,
					`${step}: in the channel's search`,
					`/${slug}/tracks?q=${token}`,
					word,
					want
				)
				await c.visit(page, `${step}: in the tag view`, `/${slug}/tracks?tags=${tag}`, word, want)
				await c.visit(
					page,
					`${step}: in a cross-channel search`,
					`/search/tracks?q=@${slug}`,
					word,
					want
				)
				if (other) {
					const stale = c.lacksText(other)
					await kit.act(page, ['go', `/${slug}/tracks`])
					const r = await c.until(page, (seen) => want(seen) && stale(seen))
					c.check(
						`${step}: the old title is gone`,
						`/${slug}/tracks`,
						r.ok,
						`no "${other}" next to the new one; shows ${c.sample(r.seen)}`
					)
				}
			})()
		await withPage(kit, async (page) => {
			try {
				await signIn(kit, page)
				await kit.act(page, ['load', `/${slug}/tracks`])
				await kit.settle(page)
				const swept = await sweep(page)
				if (swept) c.note('start', `/${slug}/tracks`, `swept ${swept} leftover walk tracks`)
				// Look at the pages first, so each is in the cache when the track appears
				await c.visit(
					page,
					'before: the search',
					`/${slug}/tracks?q=${token}`,
					'no rows',
					(s) => s.length === 0
				)
				await c.visit(
					page,
					'before: the tag view',
					`/${slug}/tracks?tags=${tag}`,
					'no rows',
					(s) => s.length === 0
				)
				await c.visit(
					page,
					'before: a cross-channel search',
					`/search/tracks?q=@${slug}`,
					'the channel',
					(s) => s.length > 0
				)

				// Add, in the form
				await kit.act(page, ['go', '/add'])
				if (!(await appears(page, 'form.form input[name=title]'))) {
					c.check('add', '/add', false, 'no add form: the robot has no active channel')
					return
				}
				await fill(page, 'form.form input[name=title]', before)
				await fill(
					page,
					'form.form input[name=url]',
					`https://www.youtube.com/watch?v=${token.padEnd(11, 'x').slice(0, 11)}`
				)
				await fill(page, 'form.form textarea[name=description]', `an order test track #${tag}`)
				await click(page, 'form.form button[type=submit]')
				await sleep(500)
				await kit.settle(page)
				const landed = await page.evaluate<string>(`location.pathname`)
				c.check(
					'add: where the form goes',
					'/add',
					landed === `/${slug}`,
					`to /${slug}; went to ${landed}`
				)
				await c.until(page, c.hasText(before))
				await views(before, '', 'added', page, true)

				// Edit, in the form
				const id = await state<string | null>(
					page,
					`return [...window.r5.tracksCollection.state.values()].find((t) => t.title === ${json(before)})?.id ?? null`
				)
				if (!id) {
					c.check(
						'add: in the collection',
						`/${slug}/tracks`,
						false,
						'the new track is not in the collection'
					)
					return
				}
				await kit.act(page, ['go', `/${slug}/tracks/${id}/edit`])
				await appears(page, 'form.form input[name=title]')
				await fill(page, 'form.form input[name=title]', after)
				await click(page, 'form.form button[type=submit]')
				await sleep(500)
				await kit.settle(page)
				await views(after, before, 'edited', page, true)
				await c.visit(
					page,
					'edited: in a text search',
					`/search?q=${token}`,
					`shows "${after}"`,
					c.hasText(after)
				)

				// Delete, in the form
				await kit.act(page, ['go', `/${slug}/tracks/${id}/delete`])
				await appears(page, 'input#confirm')
				await fill(page, 'input#confirm', after)
				await click(page, 'form.form button[type=submit]')
				await sleep(500)
				await kit.settle(page)
				await views(after, '', 'deleted', page, false)
				await c.visit(
					page,
					'deleted: in a text search',
					`/search?q=${token}`,
					`no "${after}"`,
					c.lacksText(after)
				)
			} finally {
				const left = await sweep(page).catch(() => -1)
				if (left > 0)
					c.note(
						'cleanup',
						`/${slug}/tracks`,
						`${left} walk track(s) were still there and are deleted now`
					)
			}
		})
		return c.result
	}
}

// --- the feed ---------------------------------------------------------------------

const feed: Flow = {
	name: 'feed-network',
	why: 'the feed of followed channels shows the same tracks after other pages as on a fresh load',
	flag: 'signed-in',
	async run(kit) {
		const c = flowCtx(kit)
		const path = '/explore/tracks/network'
		await withPage(kit, async (page) => {
			await signIn(kit, page)
			// The robot follows nobody, so the feed would be empty and prove nothing: follow the two
			// most recently active channels for the walk, and unfollow exactly those in `finally`
			const mine = await state<string | null>(
				page,
				`for (let i = 0; i < 50 && !window.r5.appState.channels?.[0]; i++) await new Promise((r) => setTimeout(r, 200))
				return window.r5.appState.channels?.[0] ?? null`
			)
			if (!mine) throw new Error('the robot has no channel of its own to follow from')
			const picked = await state<{id: string; slug: string}[]>(
				page,
				`const {data} = await window.r5.sdk.supabase.from('channels_with_tracks').select('id, slug').gte('latest_track_at', new Date(Date.now() - 20 * 864e5).toISOString()).order('latest_track_at', {ascending: false}).limit(2)
				return data ?? []`
			)
			const added = picked.map((ch) => ch.id)
			try {
				// Follow the way a user does: the button on the channel page
				for (const ch of picked) {
					await kit.act(page, ['go', `/${ch.slug}`])
					await kit.settle(page)
					await appears(page, 'button[aria-label="Follow"]')
					await click(page, 'button[aria-label="Follow"]')
					await sleep(1000)
				}
				c.note('follows', path, `followed ${picked.map((ch) => ch.slug).join(', ')} for the walk`)
				await kit.act(page, ['load', path])
				const ref = await kit.shoot(page)
				c.note(
					'feed, fresh load',
					path,
					`${ref.tracks.length} tracks, ${ref.channels.length} channels`
				)
				c.check(
					'feed, fresh load',
					path,
					ref.tracks.length > 0,
					'tracks from the followed channels'
				)
				const same = (step: string, shot: FlowShot) => {
					const missing = ref.tracks.filter((t) => !shot.tracks.includes(t))
					const extra = shot.tracks.filter((t) => !ref.tracks.includes(t))
					c.check(
						step,
						path,
						!missing.length && !extra.length,
						`${ref.tracks.length} tracks as on the fresh load; shows ${shot.tracks.length} (${missing.length} missing, ${extra.length} extra)`
					)
					c.check(`${step}: loader`, path, !shot.loading && shot.settled, 'no loader once quiet')
				}
				await kit.act(page, ['go', '/explore/tracks/recent'])
				await kit.settle(page)
				await kit.act(page, ['go', path])
				same('after the recent feed', await kit.shoot(page))
				await kit.act(page, ['go', `/${OWNER}/tracks`])
				await kit.settle(page)
				await kit.act(page, ['go', path])
				same('after a channel', await kit.shoot(page))
				await kit.act(page, ['go', '/search/tracks?q=love'])
				await kit.settle(page)
				await kit.act(page, ['back'])
				same('back from a search', await kit.shoot(page))
				await kit.act(page, ['reload'])
				same('after a reload', await kit.shoot(page))
			} finally {
				await state(
					page,
					`for (const id of ${json(added)}) await window.r5.sdk.channels.unfollowChannel(${json(mine)}, id)`
				).catch(() => {})
			}
		})
		return c.result
	}
}

// --- the queue --------------------------------------------------------------------

const queue: Flow = {
	name: 'queue-filter-next',
	why: 'a tag filter in the queue panel keeps next inside the matches; what next does with the panel closed is recorded',
	flag: 'default',
	async run(kit) {
		const c = flowCtx(kit)
		await withPage(kit, async (page) => {
			const path = '/counting/tracks'
			await kit.act(page, ['load', path])
			await kit.settle(page)
			await kit.act(page, ['play'])
			await kit.settle(page)
			const deck = await state<{
				id: number
				tracks: string[]
				tag: string | null
				matches: string[]
			} | null>(
				page,
				`const d = window.r5.appState.decks[window.r5.appState.active_deck_id]
				if (!d?.playlist_track) return null
				const all = window.r5.tracksCollection.state
				const counts = {}
				for (const id of d.playlist_tracks) for (const t of all.get(id)?.tags ?? []) counts[t] = (counts[t] ?? 0) + 1
				const tag = Object.entries(counts).filter(([, n]) => n >= 3 && n < d.playlist_tracks.length).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
				const matches = tag ? d.playlist_tracks.filter((id) => all.get(id)?.tags?.includes(tag)) : []
				return {id: d.id, tracks: [...d.playlist_tracks], tag, matches}`
			)
			if (!deck?.tag) {
				c.check(
					'play',
					path,
					false,
					`a deck with a queue and a tag shared by 3 or more tracks; got ${deck ? 'no usable tag' : 'no playing deck'}`
				)
				return
			}
			const panel = `[data-deck="${deck.id}"] .queue-panel`
			// A new deck is a compact bar whose queue has no rows: open it the way a user does
			if (await state<boolean>(page, `return !!window.r5.appState.decks[${deck.id}].compact`))
				await click(page, 'button.expand')
			c.check(
				'open the queue panel',
				path,
				await appears(page, `${panel} [data-track-id]`),
				'queue rows in the panel'
			)
			// Filter by tag the way a user does: tap a #tag on a row in the panel
			const tapped = await page.evaluate<boolean>(`(() => {
				const el = [...document.querySelectorAll(${json(panel)} + ' :is(a, button)')].find((e) => e.textContent.trim() === '#${deck.tag}')
				if (!el) return false
				el.click()
				return true
			})()`)
			if (!tapped)
				await state(
					page,
					`window.r5.appState.decks[${deck.id}].queue_filter = {search: '', tags: [${json(deck.tag)}], mention: ''}`
				)
			c.note(
				'filter by tag',
				path,
				`#${deck.tag}: ${deck.matches.length} of ${deck.tracks.length} tracks match${tapped ? '' : '; no #tag in the panel rows to tap, set the filter on the deck instead'}`
			)
			await sleep(600)
			const filtered = await state<number | null>(
				page,
				`return window.r5.appState.decks[${deck.id}].playlist_tracks_filtered?.length ?? null`
			)
			c.check(
				'filter by tag',
				path,
				filtered === deck.matches.length,
				`the deck narrowed to ${deck.matches.length} matches; narrowed to ${filtered}`
			)

			const press = async () => {
				await click(page, `[data-deck="${deck.id}"] .player button.next`)
				await sleep(400)
				return state<string>(page, `return window.r5.appState.decks[${deck.id}].playlist_track`)
			}
			const visited: string[] = []
			for (let i = 0; i < Math.min(deck.matches.length + 2, 12); i++) visited.push(await press())
			const outside = visited.filter((id) => !deck.matches.includes(id))
			c.check(
				'next, panel open',
				path,
				!outside.length,
				`${visited.length} nexts stay in the ${deck.matches.length} matches; ${outside.length} left them`
			)

			await state(page, `window.r5.api.toggleQueuePanel(${deck.id})`)
			await sleep(400)
			const hidden = await state<boolean>(
				page,
				`return window.r5.appState.decks[${deck.id}].hide_queue_panel`
			)
			const stillThere = await state<boolean>(
				page,
				`return !!document.querySelector(${json(panel)})`
			)
			const kept = await state<number | null>(
				page,
				`return window.r5.appState.decks[${deck.id}].playlist_tracks_filtered?.length ?? null`
			)
			const closed: string[] = []
			for (let i = 0; i < Math.min(deck.matches.length + 2, 12); i++) closed.push(await press())
			const strayed = closed.filter((id) => !deck.matches.includes(id))
			c.note(
				'next, panel closed',
				path,
				`hide_queue_panel ${hidden}, panel ${stillThere ? 'still in the DOM' : 'removed'}, filter kept ${kept ?? 'none'} of ${deck.matches.length}; ${closed.length} nexts, ${strayed.length} outside the matches${strayed.length ? '' : ' (stays within them)'}`
			)
		})
		return c.result
	}
}

// --- a channel over 4000 tracks ---------------------------------------------------

const BIG_CHANNEL = 'mrvinyl-r4'
const big: Flow = {
	name: 'big-channel-4000',
	why: 'a channel over 4000 tracks is claimed and held in full, fresh and after a search',
	flag: 'default',
	async run(kit) {
		const c = flowCtx(kit)
		const path = `/${BIG_CHANNEL}/tracks`
		const read = (page: FlowPage) =>
			state<{claim: number | null; held: number; total: number | null}>(
				page,
				`const slug = ${json(BIG_CHANNEL)}
				const tab = document.querySelector('.channel-tabs a[href$="/tracks"]')
				const claim = Number((tab?.textContent.match(/[\\d,.]+/)?.[0] ?? '').replace(/[,.]/g, '')) || null
				const held = [...window.r5.tracksCollection.state.values()].filter((t) => t.slug === slug).length
				const ch = [...window.r5.channelsCollection.state.values()].find((ch) => ch.slug === slug)
				return {claim, held, total: ch?.track_count ?? null}`
			)
		const holds = async (page: FlowPage, step: string, url: string) => {
			let r = await read(page)
			for (let i = 0; i < 10 && (!r.claim || r.held < r.claim); i++) {
				await sleep(1500)
				await kit.settle(page)
				r = await read(page)
			}
			c.check(step, url, !!r.claim && r.claim > 4000, `a claim over 4000; claims ${r.claim}`)
			c.check(
				step,
				url,
				!!r.claim && r.held === r.claim,
				`the collection holds what the page claims (${r.claim}); holds ${r.held}`
			)
			return r
		}
		await withPage(kit, async (page) => {
			await kit.act(page, ['load', path])
			await kit.settle(page)
			const cold = await holds(page, 'cold', path)
			c.note('cold', path, `claims ${cold.claim}, holds ${cold.held}, channel says ${cold.total}`)
			await kit.act(page, ['go', `${path}?q=love`])
			await kit.settle(page)
			await sleep(1000)
			await holds(page, 'after a search', `${path}?q=love`)
			await kit.act(page, ['go', path])
			await kit.settle(page)
			await holds(page, 'search cleared', path)
			await kit.act(page, ['go', `/${BIG_CHANNEL}`])
			await kit.settle(page)
			await kit.act(page, ['go', path])
			await kit.settle(page)
			await holds(page, 'home, then tracks', path)
		})
		return c.result
	}
}

export const FLOWS: Flow[] = [queue, big, importM3u, ownerFlow, feed]
