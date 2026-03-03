// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}

declare module 'd3-force-3d' {
	type ForceInstance = Record<string, (...args: unknown[]) => ForceInstance>
	export function forceSimulation(nodes?: object[], numDimensions?: number): ForceInstance
	export function forceManyBody(): ForceInstance
	export function forceLink(links?: object[]): ForceInstance
	export function forceCenter(x?: number, y?: number, z?: number): ForceInstance
	export function forceX(x?: number): ForceInstance
	export function forceY(y?: number): ForceInstance
	export function forceZ(z?: number): ForceInstance
}
