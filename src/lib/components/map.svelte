<script>
	import L from 'leaflet'

	let {latitude = null, longitude = null, zoom = null, onclick = null, onready = null, syncUrl = false} = $props()

	function setup(node) {
		const params = new URLSearchParams(location.search)
		const lat = latitude ?? (syncUrl ? Number(params.get('latitude')) || 20 : 20)
		const lng = longitude ?? (syncUrl ? Number(params.get('longitude')) || 0 : 0)
		const z = zoom ?? (syncUrl ? Number(params.get('zoom')) || 2 : 2)

		const map = L.map(node, {zoomControl: false}).setView([lat, lng], z)
		L.control.zoom({position: 'bottomright'}).addTo(map)

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap'
		}).addTo(map)

		if (onclick) {
			map.on('click', (e) => onclick({lat: e.latlng.lat, lng: e.latlng.lng}))
		}

		if (syncUrl) {
			let debounce
			map.on('moveend', () => {
				clearTimeout(debounce)
				debounce = setTimeout(() => {
					const {lat, lng} = map.getCenter()
					const z = map.getZoom()
					const url = new URL(location.href)
					url.searchParams.set('latitude', lat.toFixed(4))
					url.searchParams.set('longitude', lng.toFixed(4))
					url.searchParams.set('zoom', z)
					history.replaceState(null, '', url)
				}, 300)
			})
		}

		onready?.(map)

		return () => map.remove()
	}
</script>

<div class="map" {@attach setup}></div>

<style>
	.map {
		width: 100%;
		height: 100%;
		min-height: 300px;
		z-index: 1;
	}
</style>
