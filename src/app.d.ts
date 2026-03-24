// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			embedMode: boolean
		}
		// interface PageData {}
		interface PageState {
			tab?: string
		}
		// interface Platform {}
	}
}

export {}
