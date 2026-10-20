#!/usr/bin/env bun
// Throttle the CPU of every page in an agent-browser session, for the dev loop.
// Stays running: CDP resets the throttle when the connection closes, so Ctrl-C to stop.
//
//   bun perf/throttle.ts                 # session r4, 4x
//   bun perf/throttle.ts --session r4-perf --cpu 6

import {parseArgs} from 'node:util'

const {values: args} = parseArgs({
	options: {session: {type: 'string', default: 'r4'}, cpu: {type: 'string', default: '4'}}
})
const browserWs = Bun.spawnSync(['agent-browser', '--session', args.session!, 'get', 'cdp-url'])
	.stdout.toString()
	.trim()
if (!browserWs) throw new Error(`no agent-browser session ${args.session}; open a page first`)
const pages = (await (await fetch(`http://${new URL(browserWs).host}/json`)).json()) as {
	type: string
	url: string
	webSocketDebuggerUrl: string
}[]
for (const page of pages.filter((t) => t.type === 'page')) {
	const ws = new WebSocket(page.webSocketDebuggerUrl)
	ws.onopen = () =>
		ws.send(
			JSON.stringify({
				id: 1,
				method: 'Emulation.setCPUThrottlingRate',
				params: {rate: Number(args.cpu)}
			})
		)
	console.log(`${args.cpu}x on ${page.url}`)
}
console.log('throttling until Ctrl-C')
