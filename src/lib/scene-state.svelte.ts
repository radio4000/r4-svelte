export type Geometry = 'box' | 'sphere' | 'torus' | 'icosahedron'

export type SceneConfig = {
	geometry: Geometry
	backgroundColor?: string
	lightCycling?: boolean
	cameraPosition?: [number, number, number]
	cameraTarget?: [number, number, number]
	rotationSpeed?: number
	scrollDriven?: boolean
}

const defaultScene: SceneConfig = {
	geometry: 'box',
	backgroundColor: 'oklch(15% 0.04 260)',
	lightCycling: true,
	cameraPosition: [0, 0, 4],
	cameraTarget: [0, 0, 0],
	rotationSpeed: 0.3,
	scrollDriven: false
}

export const sceneState: {current: SceneConfig} = $state({current: {...defaultScene}})

export function setScene(config: Partial<SceneConfig>): void {
	sceneState.current = {...sceneState.current, ...config}
}
