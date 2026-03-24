<script>
	import {goto} from '$app/navigation'
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import {createChannel} from '$lib/collections/channels'
	import {slugify} from '$lib/utils'
	import * as m from '$lib/paraglide/messages'

	$effect(() => {
		if (!appState.user) {
			goto(resolve('/auth') + '?redirect=' + encodeURIComponent(resolve('/create-channel')))
		}
	})

	let error = $state('')
	let submitting = $state(false)

	let slug = $state('')
	let slugTouched = $state(false)
	let currentChannelSlug = $derived(appState.channel?.slug)

	let name = $state('')

	function handleNameInput(event) {
		name = /** @type {HTMLInputElement} */ (event.target).value
		if (!slugTouched) slug = slugify(name)
	}

	function handleSlugFocus() {
		if (!slug) slug = slugify(name)
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
			appState.channel = channel
			await goto(resolve('/[slug]', {slug: channel.slug}))
		} catch (err) {
			error = /** @type {Error} */ (err).message || m.channel_create_failed()
		} finally {
			submitting = false
		}
	}
</script>

<article class="constrained focused splash">
	{#if !appState.user}
		<p>
			<a href={resolve('/auth') + '?redirect=' + resolve('/create-channel')}
				>{m.auth_sign_in_to_create()}</a
			>
		</p>
	{:else if appState.channels?.length}
		<p>
			{m.channel_you_have()}
			{#if currentChannelSlug}
				<a href={resolve('/[slug]', {slug: currentChannelSlug})}>@{currentChannelSlug}</a>
			{:else}
				<span>{m.common_loading()}</span>
			{/if}
		</p>
		<p>{m.channel_single_channel_note()}</p>
	{:else}
		<header>
			<h1>{m.channel_create_prompt()}</h1>
		</header>

		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}

		<form class="form" onsubmit={handleSubmit}>
			<fieldset>
				<label for="name">{m.common_name()}</label>
				<input id="name" name="name" type="text" required oninput={handleNameInput} />
			</fieldset>

			<details>
				<summary><small>@{slug || '…'}</small></summary>
				<fieldset>
					<label for="slug">{m.channel_edit_slug_label()}</label>
					<input
						bind:value={slug}
						id="slug"
						name="slug"
						type="text"
						required
						pattern="[a-z0-9\-]+"
						minlength="3"
						title={m.channel_slug_hint()}
						onfocus={handleSlugFocus}
						oninput={() => (slugTouched = true)}
					/>
				</fieldset>
			</details>

			<button class="primary" type="submit" disabled={submitting}>
				{submitting ? m.channel_creating() : m.channel_create_button()}
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
			cursor: var(--interactive-cursor, pointer);
			list-style: none;
		}
		fieldset {
			margin-block-start: 0.5rem;
		}
	}
</style>
