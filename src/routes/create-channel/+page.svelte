<script>
	import {goto} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import {createChannel} from '$lib/collections/channels'
	import {slugify} from '$lib/utils'
	import IconR4 from '$lib/components/icon-r4.svelte'

	let error = $state('')
	let submitting = $state(false)

	let slug = $state('')
	let slugTouched = $state(false)

	function handleNameInput(event) {
		const name = /** @type {HTMLInputElement} */ (event.target).value
		if (!slugTouched) slug = slugify(name)
	}

	/** @param {SubmitEvent} event */
	async function handleSubmit(event) {
		event.preventDefault()
		if (submitting) return

		const formData = new FormData(/** @type {HTMLFormElement} */ (event.target))
		const name = /** @type {string} */ (formData.get('name'))
		const slug = /** @type {string} */ (formData.get('slug'))

		error = ''
		submitting = true

		try {
			const channel = await createChannel({name, slug})
			appState.channels = [...(appState.channels || []), channel.id]
			appState.channel = channel
			await goto(`/${channel.slug}`)
		} catch (err) {
			error = /** @type {Error} */ (err).message || 'Failed to create channel'
		} finally {
			submitting = false
		}
	}
</script>

<article class="constrained focused">
	<figure class="logo">
		<IconR4 />
	</figure>

	{#if !appState.user}
		<p>
			<a href="/auth?redirect=/create-channel">Sign in to create your channel.</a>
		</p>
	{:else if appState.channels?.length}
		<p>You already have a channel: <a href="/{appState.channel?.slug}">@{appState.channel?.slug}</a></p>
		<p>
			Everyone gets a single channel. Constraints can be freeing. When you like a track, add it! Use #tags in your track
			descriptions to organize as you want: highs and lows, ebbs and flows.
		</p>
	{:else}
		<header>
			<h1>Create a channel to start saving tracks.</h1>
			<p><small>You can rename or delete it later.</small></p>
		</header>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="name">Name</label>
				<input id="name" name="name" type="text" required oninput={handleNameInput} />
			</fieldset>

			<fieldset>
				<label for="slug">Slug</label>
				<input
					bind:value={slug}
					id="slug"
					name="slug"
					type="text"
					required
					pattern="[a-z0-9\-]+"
					minlength="3"
					title="At least 3 lowercase letters, numbers, or hyphens"
					oninput={() => (slugTouched = true)}
				/>
			</fieldset>

			<button class="primary" type="submit" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create'}
			</button>
		</form>
	{/if}
</article>

<style>
	header {
		margin-bottom: 2rem;
	}
</style>
