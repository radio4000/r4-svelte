// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface Document {
		modelContext?: {
			registerTool(
				tool: import('$lib/webmcp').WebMcpTool,
				options?: {signal?: AbortSignal}
			): void | Promise<void>
		}
	}

	namespace App {
		// interface Error {}
		interface Locals {
			embedMode: boolean
		}
		// interface PageData {}
		interface PageState {
			tab?: string
			focus?: boolean
		}
		// interface Platform {}
	}
}

export {}
