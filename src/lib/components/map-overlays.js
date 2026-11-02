// Day/night terminator + latitude graticule overlays for map-channels.svelte.

/** Lines at equator, tropics of Cancer/Capricorn, Arctic/Antarctic circles. */
/** @returns {import('geojson').FeatureCollection} */
export function buildGraticuleGeoJSON() {
	/** @type {{id: string, lat: number}[]} */
	const lines = [
		{id: 'equator', lat: 0},
		{id: 'tropic-cancer', lat: 23.4368},
		{id: 'tropic-capricorn', lat: -23.4368},
		{id: 'arctic', lat: 66.563},
		{id: 'antarctic', lat: -66.563}
	]
	return {
		type: 'FeatureCollection',
		features: lines.map(({id, lat}) => ({
			type: 'Feature',
			geometry: {
				type: 'LineString',
				coordinates: [
					[-180, lat],
					[180, lat]
				]
			},
			properties: {id}
		}))
	}
}

/** Night-side polygon computed from current solar position. */
/** @returns {import('geojson').FeatureCollection} */
export function buildNightGeoJSON() {
	const now = new Date()
	const dayOfYear = Math.round(
		(now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000
	)
	const decDeg = -23.45 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10))
	const dec = (decDeg * Math.PI) / 180
	// Small epsilon avoids tan(0) singularity at equinoxes
	const tanDec = Math.abs(dec) < 0.002 ? 0.002 * Math.sign(dec || 1) : Math.tan(dec)
	const noonLng = (12 - (now.getUTCHours() + now.getUTCMinutes() / 60)) * 15

	const coords = []
	for (let lng = -180; lng <= 180; lng += 2) {
		const ha = ((lng - noonLng) * Math.PI) / 180
		coords.push([lng, (Math.atan(-Math.cos(ha) / tanDec) * 180) / Math.PI])
	}

	// Build a CCW polygon (GeoJSON right-hand rule).
	// Verified via shoelace: for dec≥0 (summer N) south pole is in night → reversed terminator;
	// for dec<0 (winter N / current spring) north pole is in night → original (W→E) terminator.
	const nightPole = decDeg >= 0 ? -90 : 90
	let ring
	if (decDeg >= 0) {
		const rev = coords.toReversed()
		ring = [...rev, [-180, nightPole], [180, nightPole], rev[0]]
	} else {
		ring = [...coords, [180, nightPole], [-180, nightPole], coords[0]]
	}
	return {
		type: 'FeatureCollection',
		features: [{type: 'Feature', geometry: {type: 'Polygon', coordinates: [ring]}, properties: {}}]
	}
}

/**
 * Add night-fill + graticule line layers. Called before channels-layer so they render beneath.
 * @param {import('maplibre-gl').Map} map
 * @param {{showGraticules: boolean, showDayNight: boolean}} visibility
 */
export function setupOverlays(map, {showGraticules, showDayNight}) {
	if (!map.getSource('night-source')) {
		map.addSource('night-source', {type: 'geojson', data: buildNightGeoJSON()})
		map.addLayer({
			id: 'night-layer',
			type: 'fill',
			source: 'night-source',
			paint: {'fill-color': '#0a0a2e', 'fill-opacity': 0.45},
			layout: {visibility: showDayNight ? 'visible' : 'none'}
		})
	}
	if (!map.getSource('graticule-source')) {
		map.addSource('graticule-source', {type: 'geojson', data: buildGraticuleGeoJSON()})
		// Equator: solid red
		map.addLayer({
			id: 'graticule-equator',
			type: 'line',
			source: 'graticule-source',
			filter: ['==', ['get', 'id'], 'equator'],
			paint: {'line-color': '#cc4444', 'line-width': 1.5, 'line-opacity': 0.75},
			layout: {visibility: showGraticules ? 'visible' : 'none'}
		})
		// Tropics & polar circles: dashed blue-gray
		map.addLayer({
			id: 'graticule-other',
			type: 'line',
			source: 'graticule-source',
			filter: ['!=', ['get', 'id'], 'equator'],
			paint: {
				'line-color': '#6699bb',
				'line-width': 1,
				'line-opacity': 0.6,
				'line-dasharray': [4, 4]
			},
			layout: {visibility: showGraticules ? 'visible' : 'none'}
		})
	}
}

/**
 * Recompute the night polygon for the current time.
 * @param {import('maplibre-gl').Map} map
 */
export function updateNightLayer(map) {
	const nightSource = /** @type {import('maplibre-gl').GeoJSONSource | undefined} */ (
		map.getSource('night-source')
	)
	nightSource?.setData(buildNightGeoJSON())
}
