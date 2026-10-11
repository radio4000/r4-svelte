// Raster tile style builders + base-layer switching, shared by map.svelte and map-channels.svelte.
/** @import { StyleSpecification, RasterSourceSpecification } from 'maplibre-gl' */

const OSM_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// OSM has no dark tiles (CARTO did, but its basemaps now need an API key), so
// dark mode inverts brightness and rotates hue back — water stays blue, land dark.
/** @type {import('maplibre-gl').RasterLayerSpecification['paint']} */
const DARK_PAINT = {
	'raster-brightness-min': 0.9,
	'raster-brightness-max': 0.08,
	'raster-hue-rotate': 180,
	'raster-saturation': -0.4
}

/** @type {Record<string, Omit<RasterSourceSpecification, 'type'>>} */
const RASTER_SOURCES = {
	topo: {
		tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
		maxzoom: 17,
		attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> contributors'
	},
	satellite: {
		tiles: [
			'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
		],
		maxzoom: 19,
		attribution: 'Powered by Esri'
	}
}

export function isDarkTheme() {
	return document.documentElement.classList.contains('dark')
}

/** @param {string} id @param {Omit<RasterSourceSpecification, 'type'>} source @param {import('maplibre-gl').RasterLayerSpecification['paint']} [paint] @returns {StyleSpecification} */
function buildRasterStyle(id, source, paint) {
	return {
		version: 8,
		sources: {[id]: {type: 'raster', tileSize: 256, ...source}},
		layers: [{id, type: 'raster', source: id, ...(paint && {paint})}]
	}
}

/** @param {boolean} dark @returns {StyleSpecification} */
export function buildOsmStyle(dark) {
	return buildRasterStyle(
		'osm',
		{
			tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
			maxzoom: 19,
			attribution: OSM_ATTRIBUTION
		},
		dark ? DARK_PAINT : undefined
	)
}

/** @param {'osm'|'topo'|'satellite'} name @returns {StyleSpecification} */
export function buildMapStyle(name) {
	const source = RASTER_SOURCES[name]
	return source ? buildRasterStyle(name, source) : buildOsmStyle(isDarkTheme())
}

export const BASE_TILE_IDS = ['osm', 'topo', 'satellite']

/**
 * Swap only the base raster layer/source. A full `setStyle()` would tear down
 * every source and layer — including the channel markers, overlays and the
 * custom WebGL broadcast layer (shader recompile) — and blocks the UI ~1s.
 * Here the new base is added beneath the overlays, on top of the old base, and
 * the old base is dropped once the new tiles are in (so there's no blank flash).
 * @param {import('maplibre-gl').Map} map
 * @param {'osm'|'topo'|'satellite'} name
 */
export function swapBaseTiles(map, name) {
	if (!map) return
	const layers = map.getStyle().layers
	const bases = layers.filter((l) => BASE_TILE_IDS.includes(l.id))
	if (bases.at(-1)?.id === name) return // already the visible base
	const firstOverlay = layers.find((l) => !BASE_TILE_IDS.includes(l.id))?.id
	if (map.getSource(name)) {
		map.moveLayer(name, firstOverlay)
	} else {
		const style = buildMapStyle(name)
		const [srcId, srcDef] = Object.entries(style.sources)[0]
		map.addSource(srcId, /** @type {any} */ (srcDef))
		map.addLayer(/** @type {any} */ (style.layers[0]), firstOverlay)
	}
	const dropOldBases = () => {
		for (const l of map.getStyle().layers) {
			if (!BASE_TILE_IDS.includes(l.id) || l.id === name) continue
			if (map.getLayer(l.id)) map.removeLayer(l.id)
			if (map.getSource(l.id)) map.removeSource(l.id)
		}
	}
	if (map.isSourceLoaded(name)) dropOldBases()
	else map.once('idle', dropOldBases)
}
