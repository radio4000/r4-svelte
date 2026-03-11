<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {createChannel} from '$lib/collections/channels'
	import {slugify} from '$lib/utils'
	import IconR4 from '$lib/components/icon-r4.svelte'
	import * as m from '$lib/paraglide/messages'

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
			await goto(resolve('/[slug]', {slug: channel.slug}))
		} catch (err) {
			error = /** @type {Error} */ (err).message || 'Failed to create channel'
		} finally {
			submitting = false
		}
	}
</script>

<article class="constrained focused splash">
	{#if !appState.user}
		<p>
			<a href={resolve('/auth') + '?redirect=' + resolve('/create-channel')}>Sign in to create your channel.</a>
		</p>
	{:else if appState.channels?.length}
		<p>
			You already have a channel: <a href={resolve('/[slug]', {slug: appState.channel?.slug ?? ''})}
				>@{appState.channel?.slug}</a
			>
		</p>
		<p>
			Everyone gets a single channel. Constraints can be freeing. When you like a track, add it! Use #tags in your track
			descriptions to organize as you want: highs and lows, ebbs and flows.
		</p>
	{:else}
		<header>
			<h1>{m.channel_create_prompt()}</h1>
		</header>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="name">Name</label>
				<input id="name" name="name" type="text" required oninput={handleNameInput} />
			</fieldset>

			<details>
				<summary><small>@{slug || '…'}</small></summary>
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
						title={m.channel_slug_hint()}
						oninput={() => (slugTouched = true)}
					/>
				</fieldset>
			</details>

			<button class="primary" type="submit" disabled={submitting}>
				{submitting ? 'Creating...' : 'Create'}
			</button>
			<p><small>{m.channel_name_changeable()}</small></p>
		</form>
	{/if}
</article>

<style>
	header {
		margin-bottom: 2rem;
	}
	details {
		color: var(--gray-10);
		summary {
			cursor: pointer;
			list-style: none;
		}
		fieldset {
			margin-block-start: 0.5rem;
		}
	}
</style>
