<script>
	import {parseUrl, fetchDiscogs, extractSuggestions} from '$lib/discogs.js'

	/**
	 * @typedef {Object} DiscogsResource
	 * @property {string} [artists_sort]
	 * @property {{name: string}[]} [artists]
	 * @property {string} title
	 * @property {number} [year]
	 * @property {string[]} [genres]
	 * @property {string[]} [styles]
	 * @property {{name: string}[]} [labels]
	 */

	/** @type {{url: string, suggestions?: boolean, onsuggestion?: (e: {detail: string[]}) => void}} */
	let {url, suggestions = false, onsuggestion} = $props()

	/** @type {DiscogsResource | null} */
	let resource = $state(null)
	let selectedTags = $state([])

	$effect(() => {
		if (url) {
			loadResource(url)
		} else {
			resource = null
		}
	})

	async function loadResource(discogsUrl) {
		const info = parseUrl(discogsUrl)
		if (info?.id && info?.type) {
			try {
				resource = await fetchDiscogs(info)
			} catch (e) {
				console.error('Error fetching discogs', e)
				resource = null
			}
		} else {
			resource = null
		}
	}

	function handleTagChange(tag, checked) {
		if (checked) {
			selectedTags = [...selectedTags, tag]
		} else {
			selectedTags = selectedTags.filter((t) => t !== tag)
		}
		onsuggestion?.({detail: selectedTags})
	}

	const suggestionsList = $derived(resource ? extractSuggestions(/** @type {DiscogsResource} */ (resource)) : [])
	const artistsDisplay = $derived(
		/** @type {DiscogsResource | null} */ (resource)?.artists_sort ||
			/** @type {DiscogsResource | null} */ (resource)?.artists?.map((a) => a.name).join(', ') ||
			''
	)
</script>

{#if resource}
	<div class="r4-discogs-resource">
		<h3>{artistsDisplay} — {resource.title}</h3>

		{#if suggestions && suggestionsList.length > 0}
			<fieldset>
				<legend>Suggested tags</legend>
				{#each suggestionsList as tag (tag)}
					<label>
						<input
							type="checkbox"
							name="tags"
							value={tag}
							checked={selectedTags.includes(tag)}
							onchange={(e) => handleTagChange(tag, /** @type {HTMLInputElement} */ (e.target).checked)}
						/>
						{tag}
					</label>
				{/each}
			</fieldset>
		{/if}
	</div>
{/if}

<style>
	.r4-discogs-resource {
		margin: 1rem 0;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-right: 0.5rem;
	}
</style>
