# Deployment & CI

After running `bun run build` you have everything inside the `./dist` folder to deploy to any static webhost.

For this repository, Cloudflare is configured to deploy for us:

- pushes to main go to https://beta.radio4000.com
- pull requests (non-draft) get their own, unique URL

Run `bun run check` to format and lint the entire code base.
Run `bun run knip` for additional reports on unused code etc.
Run `bun run types` to let Svelte check the project.
Run `bun run test` to run our tests.
Run `bun update -i` to interactively decide which dependencies to update, if any.

## PWA / Offline support

The app is a Progressive Web App via `@vite-pwa/sveltekit` (Workbox `generateSW` strategy).

At build time, Workbox precaches the full app shell (JS, CSS, HTML, fonts, images). After the first visit, the app loads offline. Previously synced TanStack IndexedDB data (channels, tracks) is also available offline.

Config lives in `vite.config.ts` → `SvelteKitPWA(...)`. The web app manifest is `static/webmanifest.json` (linked in `src/app.html`); `manifest: false` tells the plugin not to generate its own.

What works offline:
- Full app shell (all routes render)
- Previously synced channels and tracks (IDB)
- Importing local backup files

What requires network:
- Sign in / account actions
- Fetching new remote data
- Media playback (YouTube/SoundCloud streams)
