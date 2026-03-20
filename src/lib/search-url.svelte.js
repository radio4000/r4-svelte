import {page} from '$app/state'
import {afterNavigate, goto} from '$app/navigation'
import {Debounced} from 'runed'

/**
 * Debounced input ↔ URL sync for search routes.
 * Use: `const search = new SearchUrl('/search/tracks', toUrl)`
 * Bind: `bind:value={search.value}`
 */
export class SearchUrl {
	value = $state('')
	/** @type {Debounced<string>} */
	debouncedInput
	#inputSeeded = false
	#basePath

	/**
	 * @param {string} basePath
	 * @param {(query: string) => string} [toUrl]
	 */
	constructor(basePath, toUrl) {
		this.#basePath = basePath
		const buildUrl = toUrl ?? ((q) => `${basePath}?q=${encodeURIComponent(q)}`)

		this.value = page.url.searchParams.get('q') ?? ''
		this.debouncedInput = new Debounced(() => this.value, 300)
		this.#inputSeeded = !!page.url.searchParams.get('q')

		afterNavigate(({type}) => {
			if (type === 'goto') return
			const q = page.url.searchParams.get('q') ?? ''
			this.value = q
			this.#inputSeeded = !!q
		})

		$effect(() => {
			const q = this.debouncedInput.current.trim()
			if (!q) return
			if (this.#inputSeeded) {
				this.#inputSeeded = false
				return
			}
			goto(buildUrl(q), {replaceState: true})
		})
	}

	handleSubmit = (e) => {
		e.preventDefault()
		const q = this.value.trim()
		if (!q) {
			goto(this.#basePath, {replaceState: true})
			return
		}
		this.debouncedInput.setImmediately(this.value)
	}

	seedInput(value) {
		this.#inputSeeded = true
		this.value = value
	}
}
