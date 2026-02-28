<script>
	import {resolve} from '$app/paths'
	import {appState} from '$lib/app-state.svelte'
	import Icon from '$lib/components/icon.svelte'
	import {tooltip} from '$lib/components/tooltip-attachment.svelte.js'
	import * as m from '$lib/paraglide/messages'
	import {useLiveQuery as useLiveQueryCustom} from '$lib/useLiveQuery.svelte'
	import {viewsCollection} from '$lib/collections/views'
	import {parseView} from '$lib/views.svelte'

	const viewsQuery = useLiveQueryCustom(viewsCollection)
	const pinnedViews = $derived(
		(viewsQuery.data ?? [])
			.filter((sv) => sv.position != null)
			.toSorted((a, b) => (a.position ?? 0) - (b.position ?? 0))
			.map((sv) => {
				const view = parseView(new URLSearchParams(sv.params))
				const channels = view.channels || []
				const isSingleChannel = channels.length === 1 && !view.tags?.length && !view.search
				const href = isSingleChannel ? resolve(`/${channels[0]}`) : resolve(`/search?${sv.params}`)
				return {sv, href}
			})
	)
</script>

{#each pinnedViews as pv (pv.sv.id)}
	<a href={pv.href} class="btn pin-link" aria-label={pv.sv.name}>
		{pv.sv.name}
	</a>
{:else}
	{#if appState.user}
		<a
			href={resolve('/settings/pins')}
			class="btn ghost pin-link pin-add"
			{@attach tooltip({content: 'Pin views to sidebar'})}
			aria-label={m.views_pin_label()}
		>
			<Icon icon="pin" size={16} />
		</a>
	{/if}
{/each}

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
