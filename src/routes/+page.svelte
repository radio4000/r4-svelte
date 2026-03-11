<script>
	import {page} from '$app/state'
	import {resolve} from '$app/paths'
	import {afterNavigate} from '$app/navigation'
	import {appState} from '$lib/app-state.svelte'
	import Channels from '$lib/components/channels.svelte'
	import * as m from '$lib/paraglide/messages'

	const display = $derived(page?.url?.searchParams?.get('display'))

	const validDisplays = /** @type {const} */ (['grid', 'list', 'map', 'infinite', 'tuner'])
	const validFilters = /** @type {const} */ (['all', 'broadcasting', 'imported', '10+', '100+', '1000+', 'artwork'])

	afterNavigate(({from}) => {
		if (display && validDisplays.includes(/** @type {any} */ (display)) && display !== appState.channels_display) {
			appState.channels_display = /** @type {typeof validDisplays[number]} */ (display)
		}
		const toFilter = page?.url?.searchParams?.get('filter')
		const fromFilter = from?.url?.searchParams?.get('filter')
		if (toFilter && validFilters.includes(/** @type {any} */ (toFilter)) && toFilter !== fromFilter) {
			appState.channels_filter = /** @type {typeof validFilters[number]} */ (toFilter)
		}
	})
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

{#if !appState.user && appState.show_welcome_hint !== false}
	<p class="welcome">
		Welcome! <a href={resolve('/welcome')}>Learn about Radio4000</a> or <a href={resolve('/auth/login')}>sign in</a>
		<button class="link" onclick={() => (appState.show_welcome_hint = false)}>
			<small>(dismiss)</small>
		</button>
	</p>
{/if}

<Channels {display} />

<style>
	.welcome {
		margin: 0.5rem;

		.link {
			margin-top: 0.1rem;
			margin-left: 0.5rem;
			color: initial;
			text-decoration: none;
		}
	}
</style>
