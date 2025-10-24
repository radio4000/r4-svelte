/**
 * Simple browser CLI - maps commands directly to r5 functions
 * No yargs dependency, just string parsing and function calls
 */

import * as playerApi from './api/player.js'
import {appStateCollection} from './collections'
import {pg} from './r5/db'
import {r5} from './r5/index.js'
import {useAppState} from './app-state.svelte'

const COMMANDS = {
	channels: {
		methods: ['local', 'r4', 'pull', 'v1'],
		argMap: (args) => (args[0] ? [{slug: args[0]}] : [])
	},
	tracks: {
		methods: ['local', 'r4', 'pull', 'v1'],
		argMap: (args) => {
			if (args.includes('pull') && !args[1]) {
				throw new Error('tracks pull requires a channel slug')
			}
			return args[0] ? [{slug: args[0]}] : []
		}
	},
	search: {
		methods: ['channels', 'tracks', 'all'],
		argMap: (args, method) => {
			if (method === 'all') return [args.join(' ')]
			return [args.join(' ')]
		}
	},
	db: {
		methods: ['reset', 'export', 'migrate'],
		argMap: () => []
	},
	pull: {
		methods: [],
		argMap: (args) => {
			if (!args[0]) throw new Error('pull requires a channel slug')
			return [args[0]]
		}
	},
	play: {
		methods: [],
		argMap: () => []
	},
	pause: {
		methods: [],
		argMap: () => []
	},
	next: {
		methods: [],
		argMap: () => []
	},
	prev: {
		methods: [],
		argMap: () => []
	},
	shuffle: {
		methods: [],
		argMap: () => []
	}
}

const HELP_TEXT = `R5 - A Radio4000 experiment

Commands:
  help                         Show this help
  search <query>               Search everything
  search channels <query>      Search only channels
  search tracks <query>        Search only tracks
  channels local [slug]        List local channels
  channels r4 [slug]           List remote channels
  channels pull [slug]         Pull channels from remote
  tracks local [slug]          List local tracks
  tracks r4 [slug]             List remote tracks
  tracks pull <slug>           Pull tracks for channel
  pull <slug>                  Pull channel and tracks
  db reset                     Reset database
  db migrate                   Run migrations
  db export                    Export database
  play                         Toggle play/pause current track
  pause                        Pause current track
  next                         Play next track
  prev                         Play previous track
  shuffle                      Toggle shuffle mode

Examples:
  search jazz
  search channels electronic
  channels local
  tracks r4 ko002
  pull ko002`

/** Parse and execute command */
export function createBrowserCli(onOutput) {
	const log = (text, data) => onOutput('success', text, data)
	const error = (text) => onOutput('error', text)
	const appState = useAppState()

	async function handlePlayerCommand(cmd) {
		const ytPlayer = document.querySelector('youtube-video')

		switch (cmd) {
			case 'play':
				if (!ytPlayer) {
					return error('No YouTube player found')
				}
				playerApi.togglePlay(ytPlayer)
				return log(ytPlayer.paused ? 'Playing' : 'Paused')

			case 'pause':
				if (!ytPlayer) {
					return error('No YouTube player found')
				}
				playerApi.pause(ytPlayer)
				return log('Paused')

			case 'next': {
				const currentTrack = await getCurrentTrack()
				if (!currentTrack) {
					return error('No current track')
				}
				const activeQueue = appState.shuffle ? appState.playlist_tracks_shuffled : appState.playlist_tracks
				playerApi.next(currentTrack, activeQueue, 'user_next')
				return log('Playing next track')
			}

			case 'prev': {
				const prevTrack = await getCurrentTrack()
				if (!prevTrack) {
					return error('No current track')
				}
				const prevQueue = appState.shuffle ? appState.playlist_tracks_shuffled : appState.playlist_tracks
				playerApi.previous(prevTrack, prevQueue, 'user_prev')
				return log('Playing previous track')
			}

			case 'shuffle':
				playerApi.toggleShuffle()
				return log(`Shuffle ${appState.shuffle ? 'on' : 'off'}`)
		}
	}

	async function getCurrentTrack() {
		if (!appState.playlist_track) return null
		const result = await pg.sql`SELECT * FROM tracks WHERE id = ${appState.playlist_track}`
		return result.rows[0]
	}

	function formatResults(results) {
		if (!results || (Array.isArray(results) && results.length === 0)) {
			return log('No results found')
		}

		if (results.channels || results.tracks) {
			// Mixed search results
			if (results.channels?.length) {
				log('Channels:')
				results.channels.forEach((ch) => {
					log(`  @${ch.slug}\t${ch.name || 'Untitled'}`)
				})
			}
			if (results.tracks?.length) {
				log('Tracks:')
				results.tracks.forEach((tr) => {
					log(`  ${tr.title || 'Untitled'}\t${tr.url}`)
				})
			}
		} else if (Array.isArray(results)) {
			log(`✓ ${results.length} results`, results)
		} else {
			log('✓ Success', results)
		}
	}

	async function parseCommand(commandString) {
		const parts = commandString.trim().split(/\s+/)
		const [cmd, method, ...args] = parts

		try {
			// Special cases
			if (cmd === 'help') {
				return log(HELP_TEXT)
			}

			// Player commands
			if (['play', 'pause', 'next', 'prev', 'shuffle'].includes(cmd)) {
				return handlePlayerCommand(cmd)
			}

			const config = COMMANDS[cmd]
			if (!config) {
				return error(`Unknown command: ${cmd}. Type 'help' for available commands.`)
			}

			// Handle --help flag
			if (method === '--help' || method === 'help') {
				const methods =
					config.methods.length > 0
						? `Available methods: ${config.methods.join(', ')}`
						: 'No additional methods available'
				return log(`${cmd}: ${methods}`)
			}

			// Find the function to call
			let fn = r5[cmd]
			let fnArgs = args

			if (method && config.methods.includes(method)) {
				fn = r5[cmd][method]
			} else if (cmd === 'search') {
				// For search, default to 'all' and treat method as argument if provided
				fn = r5.search.all
				if (method) {
					fnArgs = [method, ...args]
				}
			} else if (method) {
				// Method not in list, treat as argument
				fnArgs = [method, ...args]
			} else if (config.methods.length > 0) {
				// Command without method - default to first available or show help
				if (config.methods.includes('local')) {
					fn = r5[cmd].local
				} else {
					const methods = config.methods.join(', ')
					return log(`${cmd} requires a method. Available: ${methods}`)
				}
			}

			if (!fn || typeof fn !== 'function') {
				return error(`Function not found: ${cmd} ${method || ''}`)
			}

			// Transform arguments
			const transformedArgs = config.argMap(fnArgs, method)

			// Execute and format results
			const result = await fn(...transformedArgs)

			if (typeof result === 'string') {
				log(result)
			} else if (cmd === 'pull' || method === 'pull') {
				if (Array.isArray(result)) {
					log(`Pulled ${result.length} item${result.length === 1 ? '' : 's'}`)
				} else {
					log('Pull completed successfully')
				}
			} else if (cmd === 'db') {
				log(`Database ${method} completed`)
			} else {
				formatResults(result, cmd)
			}
		} catch (err) {
			error(`✗ ${err.message}`)
		}
	}

	function getCompletions(partial) {
		const parts = partial.trim().split(/\s+/)

		if (parts.length <= 1) {
			return ['help', 'search', 'channels', 'tracks', 'pull', 'db', 'play', 'pause', 'next', 'prev', 'shuffle'].filter(
				(cmd) => cmd.startsWith(parts[0] || '')
			)
		}

		const [cmd, method] = parts
		const config = COMMANDS[cmd]

		if (config && parts.length === 2) {
			return config.methods.filter((m) => m.startsWith(method || ''))
		}

		return []
	}

	return {parseCommand, getCompletions}
}
