<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import {useLiveQuery as useLiveQueryCustom} from '$lib/tanstack/useLiveQuery.svelte'
	import {pinsCollection, viewsCollection} from '$lib/tanstack/collections'
	import {parseView} from '$lib/views.svelte'

	const pinsQuery = useLiveQueryCustom(pinsCollection)
	const viewsQuery = useLiveQueryCustom(viewsCollection)
	const pins = $derived((pinsQuery.data ?? []).toSorted((a, b) => a.position - b.position))
	const pinnedViews = $derived(
		pins
			.map((pin) => {
				const sv = (viewsQuery.data ?? []).find((v) => v.id === pin.view_id)
				if (!sv) return null
				const view = parseView(new URLSearchParams(sv.params))
				const channels = view.channels || []
				const isSingleChannel = channels.length === 1 && !view.tags?.length && !view.search
				const href = isSingleChannel ? resolve(`/${channels[0]}`) : resolve(`/search?${sv.params}`)
				return {pin, sv, href}
			})
			.filter((x) => x !== null)
	)
</script>

{#each pinnedViews as pv (pv.pin.id)}
	<a href={pv.href} class="btn pin-link" aria-label={pv.sv.name}>
		{pv.sv.name}
	</a>
{/each}
{#if appState.user}
	<a
		href={resolve('/settings/pins')}
		class="btn ghost pin-link pin-add"
		{@attach tooltip({content: 'Pin views to sidebar'})}
		aria-label="Pin views"
	>
		<Icon icon="pin" size={16} />
	</a>
{/if}

<style>
	.pin-add:not(:hover) {
		opacity: 0.5;
	}

	.pin-link {
		white-space: normal;
		word-break: break-all;
		font-size: var(--font-1);
		padding: 0;
		max-width: 2.625rem;
	}
</style>
