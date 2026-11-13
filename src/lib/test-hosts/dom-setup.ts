// The DOM test project loads SvelteKit's browser modules, whose dev build of
// `$env/dynamic/public` reads the env the dev server puts on this global.
;(globalThis as Record<string, unknown>).__sveltekit_dev = {
	env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('PUBLIC_')))
}
