import {logger} from '$lib/logger'

const log = logger.ns('soundcloud-player').seal()

class SoundCloudPlayerElement extends HTMLElement {
	static observedAttributes = ['src', 'autoplay', 'controls', 'muted', 'playsinline']

	/** @type {any | null} */
	api = null

	isLoaded = false

	/** Use this to await the READY event from the SC Widget API. Call resolveLoad() once ready. */
	#loadComplete
	/** @type {function | null} */
	#resolveLoad = null

	#pendingVideoLoad = false

	/** @type {number | null} */
	#errorCode = null

	/** Cached values since SC Widget uses async getters */
	#cachedPaused = true
	#cachedVolume = 1
	#cachedDuration = NaN
	#cachedCurrentTime = 0

	constructor() {
		super()
		this.attachShadow({mode: 'open'})
		this.#loadComplete = new Promise((resolve) => {
			this.#resolveLoad = resolve
		})
	}

	async connectedCallback() {
		if (!this.shadowRoot) return

		// Create iframe with SoundCloud embed
		this.shadowRoot.innerHTML = `
			<style>
				:host { display: block; width: 100%; height: 200px; }
				iframe { width: 100%; height: 100%; }
			</style>
			<iframe id="player" frameborder="0" allow="autoplay"></iframe>
		`

		try {
			await this.loadSoundCloudAPI()
			await this.#initializePlayer()
		} catch (err) {
			log.error('Failed to initialize SoundCloud player:', err)
		}
	}

	disconnectedCallback() {
		// Unbind all widget events to prevent memory leaks
		if (this.api) {
			log.debug('disconnectedCallback: unbinding widget events')
			this.api.unbind(globalThis.SC.Widget.Events.READY)
			this.api.unbind(globalThis.SC.Widget.Events.PLAY)
			this.api.unbind(globalThis.SC.Widget.Events.PAUSE)
			this.api.unbind(globalThis.SC.Widget.Events.FINISH)
			this.api.unbind(globalThis.SC.Widget.Events.PLAY_PROGRESS)
			this.api.unbind(globalThis.SC.Widget.Events.SEEK)
			this.api.unbind(globalThis.SC.Widget.Events.ERROR)
		}
	}

	async #initializePlayer() {
		log.debug('initializePlayer')
		const iframe = this.shadowRoot?.querySelector('iframe')

		// Don't initialize without a src, similar to YouTube player
		const initialSrc = this.getAttribute('src')
		if (!initialSrc) {
			log.debug('No src yet, skipping initialization')
			return
		}

		if (iframe && !iframe.src) {
			// Build SoundCloud embed URL
			const trackUrl = this.getAttribute('src') || ''
			const autoplay = this.hasAttribute('autoplay') ? 'true' : 'false'
			iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=${autoplay}&visual=true&show_user=true&show_artwork=true`
		}

		try {
			this.api = globalThis.SC.Widget(iframe)

			// Bind events
			this.api.bind(globalThis.SC.Widget.Events.READY, () => {
				this.isLoaded = true
				this.#resolveLoad?.()
				log.debug('ready')

				// Set initial volume/mute state
				if (this.hasAttribute('muted')) {
					this.api.setVolume(0)
				}

				// Load track if src is already set or was pending
				if (this.src || this.#pendingVideoLoad) {
					log.debug('onReady calling loadTrack')
					this.#pendingVideoLoad = false
					this.#loadTrack()
				}
			})

			this.api.bind(globalThis.SC.Widget.Events.PLAY, () => {
				log.debug('PLAY event')
				this.#cachedPaused = false
				this.dispatchEvent(new Event('play'))
				this.dispatchEvent(new Event('playing'))
			})

			this.api.bind(globalThis.SC.Widget.Events.PAUSE, () => {
				log.debug('PAUSE event')
				this.#cachedPaused = true
				this.dispatchEvent(new Event('pause'))
			})

			this.api.bind(globalThis.SC.Widget.Events.FINISH, () => {
				log.debug('FINISH event')
				this.#cachedPaused = true
				this.dispatchEvent(new Event('ended'))
			})

			this.api.bind(globalThis.SC.Widget.Events.PLAY_PROGRESS, (data) => {
				// data = {currentPosition: ms, relativePosition: 0-1}
				this.#cachedCurrentTime = data.currentPosition / 1000
				this.dispatchEvent(new Event('timeupdate'))
			})

			this.api.bind(globalThis.SC.Widget.Events.SEEK, (data) => {
				// data = {currentPosition: ms}
				this.#cachedCurrentTime = data.currentPosition / 1000
				this.dispatchEvent(new Event('seeked'))
			})

			this.api.bind(globalThis.SC.Widget.Events.ERROR, (error) => {
				log.error('SoundCloud error:', error)
				this.#errorCode = error
				this.dispatchEvent(new Event('error'))
			})

			// Cache duration when available
			this.api.getDuration((duration) => {
				this.#cachedDuration = duration / 1000
				this.dispatchEvent(new Event('durationchange'))
			})

			log.debug('SC.Widget created:', !!this.api)
		} catch (error) {
			log.error('Failed to create SC.Widget:', error)
		}
	}

	async attributeChangedCallback(attrName, oldValue, newValue) {
		if (attrName === 'src' && oldValue !== newValue && newValue) {
			log.debug('src changed to:', newValue)

			// If player was never initialized (no api), initialize it now
			if (!this.api) {
				log.debug('Player not initialized yet, initializing now with src')
				try {
					await this.loadSoundCloudAPI()
					await this.#initializePlayer()
				} catch (err) {
					log.error('Failed to initialize SoundCloud player:', err)
				}
				return
			}

			if (this.isLoaded) {
				await this.#loadTrack()
			} else {
				log.debug('player not ready yet, marking as pending load')
				this.#pendingVideoLoad = true
			}
		}
	}

	async #loadTrack() {
		await this.#loadComplete
		const trackUrl = this.src
		log.debug('loadTrack', trackUrl)
		if (!trackUrl) return

		// Reset state for new track
		this.#errorCode = null
		this.#cachedDuration = NaN

		// Fire durationchange to signal new media
		this.dispatchEvent(new Event('durationchange'))

		if (!this.api) return

		// Load the new track
		const options = {
			auto_play: this.hasAttribute('autoplay')
		}
		this.api.load(trackUrl, options)

		// Update cached duration
		this.api.getDuration((duration) => {
			this.#cachedDuration = duration / 1000
			this.dispatchEvent(new Event('durationchange'))
		})
	}

	async play() {
		log.debug('play')
		await this.#loadComplete
		if (!this.api) return
		this.api.play()
	}

	async pause() {
		await this.#loadComplete
		if (this.api) {
			this.api.pause()
		}
	}

	get paused() {
		return this.#cachedPaused
	}

	get currentTime() {
		return this.#cachedCurrentTime
	}

	set currentTime(val) {
		if (this.currentTime === val) return
		this.#loadComplete.then(() => {
			// SoundCloud expects milliseconds
			this.api?.seekTo(val * 1000)
		})
	}

	get duration() {
		return this.#cachedDuration
	}

	get error() {
		return this.#errorCode
	}

	get volume() {
		return this.#cachedVolume
	}

	set volume(val) {
		if (this.volume === val) return
		this.#cachedVolume = val
		this.#loadComplete.then(() => {
			log.debug('setting volume to:', val)
			if (this.api?.setVolume) {
				// SoundCloud expects 0-100
				this.api.setVolume(val * 100)
			}
		})
	}

	get muted() {
		return this.#cachedVolume === 0
	}

	set muted(val) {
		if (this.muted === val) return
		this.#loadComplete.then(() => {
			log.debug('setting muted to:', val)
			if (val && this.api?.setVolume) {
				this.#cachedVolume = 0
				this.api.setVolume(0)
			} else if (!val && this.api?.setVolume) {
				this.#cachedVolume = 1
				this.api.setVolume(100)
			}
			this.dispatchEvent(new Event('volumechange'))
		})
	}

	get src() {
		return this.getAttribute('src')
	}

	set src(value) {
		if (value) {
			this.setAttribute('src', value)
		} else {
			this.removeAttribute('src')
		}
	}

	loadSoundCloudAPI() {
		log.debug('loadSoundCloudAPI')

		if (globalThis.SC?.Widget) {
			log.debug('loadSoundCloudAPI resolving with existing global SC.Widget instance')
			return new Promise((resolve) => resolve(globalThis.SC))
		}

		return new Promise((resolve) => {
			// SC Widget API will be ready when the script loads
			const checkSC = setInterval(() => {
				if (globalThis.SC?.Widget) {
					clearInterval(checkSC)
					log.debug('SoundCloud API loaded')
					resolve(globalThis.SC)
				}
			}, 100)

			this.#loadScript()
		})
	}

	#loadScript() {
		if (!document.querySelector('script[src*="soundcloud.com/player/api.js"]')) {
			const script = document.createElement('script')
			script.src = 'https://w.soundcloud.com/player/api.js'
			document.head.appendChild(script)
			log.debug('SoundCloud API script added')
		} else {
			log.debug('SoundCloud API script already exists')
		}
	}
}

if (!customElements.get('soundcloud-player')) {
	customElements.define('soundcloud-player', SoundCloudPlayerElement)
}

export default SoundCloudPlayerElement
