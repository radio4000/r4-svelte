<script lang="ts">
	import {appState} from '$lib/app-state.svelte'
	import Dialog from '$lib/components/dialog.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {channelUrl, trackUrl, channelEmbed, copyToClipboard, canNativeShare, nativeShare} from '$lib/share'
	import type {Track, Channel} from '$lib/types'
	import * as m from '$lib/paraglide/messages'

	let showModal = $state(false)
	let copiedField = $state<string | null>(null)
	let data = $state<{track?: Track; channel: Channel} | null>(null)

	const isTrack = $derived(!!data?.track)
	const title = $derived(
		isTrack
			? m.share_track_title({title: data?.track?.title ?? ''})
			: m.share_channel_title({name: data?.channel?.name ?? ''})
	)
	const url = $derived(data ? (data.track ? trackUrl(data.channel, data.track) : channelUrl(data.channel)) : '')
	const mediaUrl = $derived(data?.track?.url ?? '')
	const embed = $derived(data?.channel ? channelEmbed(data.channel) : '')

	$effect(() => {
		if (appState.modal_share) {
			data = appState.modal_share
			showModal = true
			appState.modal_share = null
		}
	})

	async function copy(text: string, field: string) {
		if (await copyToClipboard(text)) {
			copiedField = field
			setTimeout(() => (copiedField = null), 1500)
		}
	}

	async function share() {
		if (!data) return
		const {track, channel} = data
		await nativeShare(
			track
				? {title: track.title, text: `@${channel.slug}`, url}
				: {title: channel.name ?? '', text: channel.description?.slice(0, 100) ?? '', url}
		)
	}

	function selectAll(e: FocusEvent) {
		;(e.target as HTMLInputElement).select()
	}
</script>

<Dialog bind:showModal>
	{#snippet header()}
		<h2>{title}</h2>
	{/snippet}

	<form class="form">
		<fieldset>
			<label for="share-url">{m.common_url()}</label>
			<div class="row">
				<input id="share-url" type="text" readonly value={url} onfocus={selectAll} />
				<button type="button" onclick={() => copy(url, 'url')}>
					{copiedField === 'url' ? m.share_copied() : m.share_copy()}
				</button>
			</div>
		</fieldset>

		{#if isTrack && mediaUrl}
			<fieldset>
				<label for="share-media">{m.share_media_url_label()}</label>
				<div class="row">
					<input id="share-media" type="text" readonly value={mediaUrl} onfocus={selectAll} />
					<button type="button" onclick={() => copy(mediaUrl, 'media')}>
						{copiedField === 'media' ? m.share_copied() : m.share_copy()}
					</button>
				</div>
			</fieldset>
		{/if}

		{#if !isTrack}
			<fieldset>
				<label for="share-embed">{m.share_embed_label()}</label>
				<div class="row">
					<input id="share-embed" type="text" readonly value={embed} onfocus={selectAll} />
					<button type="button" onclick={() => copy(embed, 'embed')}>
						{copiedField === 'embed' ? m.share_copied() : m.share_copy()}
					</button>
				</div>
			</fieldset>
		{/if}

		{#if canNativeShare()}
			<button type="button" onclick={share}>
				<Icon icon="share" />
				{m.channel_card_share()}
			</button>
		{/if}
	</form>
</Dialog>

<style>
	input {
		flex: 1;
		min-width: 0;
	}
</style>
