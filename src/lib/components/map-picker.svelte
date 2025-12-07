<script>
	import * as m from '$lib/paraglide/messages'
	import MapComponent from '$lib/components/map.svelte'

	const {latitude = null, longitude = null, title = '', onselect = () => {}} = $props()

	let selected = $state(null)
	let mapComponent

	const markers = $derived(
		latitude && longitude
			? [
					{
						latitude,
						longitude,
						title: title || ''
					}
				]
			: []
	)

	function handleMapClick(coords) {
		selected = coords
		onselect(selected)
	}

	function clearSelection() {
		selected = null
		onselect({})
		mapComponent?.clearNewMarker()
	}
</script>

<MapComponent bind:this={mapComponent} {markers} {latitude} {longitude} selectMode={true} onmapclick={handleMapClick} />

{#if selected}
	<button type="button" onclick={clearSelection}>
		{m.common_cancel()}
	</button>
{/if}
