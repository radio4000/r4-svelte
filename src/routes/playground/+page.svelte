<script>
	// import {liveQuery} from '$lib/live-query'
	import {toggleQueuePanel} from '$lib/api'
	import {useAppState} from '$lib/app-state.svelte'
	import {appStateCollection} from '$lib/collections'
	import InputRange from '$lib/components/input-range.svelte'

	const appState = $derived(useAppState().data)
	let count = $state()
	const double = $derived(count * 2)

	let localVolume = $state(appState?.volume ?? 0.5)

	$effect(() => {
		if (appState?.volume !== undefined) {
			localVolume = appState.volume
		}
	})

	function updateVolume(newVolume) {
		appStateCollection.update(1, (draft) => {
			draft.volume = newVolume
		})
	}

	// $effect(() => {
	// 	return liveQuery(`select counter from app_state where id = 1`, [], (stuff) => {
	// 		console.log('app state live query from /playground ran')
	// 		count = stuff.rows[0].counter
	// 	})
	// })

	function add() {
		throw new Error('something bad happened')
		//return pg.sql`insert into channels (name, slug) values (${'huguooo'}, ${'hugo123'})`
	}
</script>

<svelte:head>
	<title>Playground - R5</title>
</svelte:head>

<h1>playground</h1>

<section>
	<button onclick={toggleQueuePanel}> 🔄 Toggle Queue Panel </button>
	<p>queue_panel_visible: {appState?.queue_panel_visible}</p>
	<InputRange bind:value={localVolume} min={0} max={1} step={0.1} oninput={(e) => updateVolume(e.target.value)} />
	<p>volume: {appState?.volume}</p>
</section>

<hr />

<button onclick={add}>throw an unexpected error</button>
<p>{count} x 2 = {double}</p>
