# Deployment & CI

## Cloudflare (default)

Cloudflare is configured to deploy automatically:

- pushes to main go to https://beta.radio4000.com
- pull requests (non-draft) get their own, unique URL

## Standalone / self-hosted

The standalone build produces a static SPA that works on any web server (nginx, S3, Netlify, GitHub Pages, etc.) with no backend required.

Set `PUBLIC_APP_MODE=standalone` to enable it. This switches the build adapter to `@sveltejs/adapter-static` (SPA mode with `fallback: 404.html`) and disables Supabase auth and remote data fetching.

### GitHub Pages (fork-based)

Fork the repo, then go to Settings → Pages → Source: **GitHub Actions**.

The Pages workflow only runs when `PUBLIC_APP_MODE=standalone` is configured. If it is unset or set to anything else, the workflow jobs are skipped.

Add these Actions variables (Settings → Secrets and variables → Variables):

| Variable                 | Required | Example                                    |
| ------------------------ | -------- | ------------------------------------------ |
| `PUBLIC_APP_MODE`        | yes      | `standalone`                               |
| `PUBLIC_SEED_URLS`       | yes      | `https://cdn.example.com/backup.json`      |
| `PUBLIC_APP_NAME`        | no       | `My Radio`                                 |
| `PUBLIC_APP_SHORT_NAME`  | no       | `MR`                                       |
| `PUBLIC_APP_URL`         | no       | `https://yourname.github.io/r4-sync-tests` |
| `PUBLIC_APP_DESCRIPTION` | no       | `My personal radio`                        |
| `BASE_PATH`              | no       | auto-detected from repo name               |

`BASE_PATH` defaults to `/<repo-name>` automatically. Set it to empty string if deploying to a root domain.

Push to main (or trigger manually via Actions → Deploy to GitHub Pages → Run workflow) to deploy.

### Local build

```sh
git clone https://github.com/radio4000/r4-sync-tests
cd r4-sync-tests
bun install
```

Configure in `.env` — gitignored, never touched by `git pull`:

```sh
PUBLIC_APP_MODE=standalone
PUBLIC_SEED_URLS=/data/backup.json
```

Put data files in `static/data/` (also gitignored):

```sh
mkdir static/data
r4 backup <slug> > static/data/backup.json
```

Build and deploy:

```sh
bun run build
# deploy the build/ folder to any static host
```

### Updating

```sh
git pull && bun run build
```

Your `.env` and `static/data/` are untouched. No conflicts, ever.

### Seed data

`PUBLIC_SEED_URLS` is a comma-separated list of URLs fetched by the browser on first load, imported into IndexedDB. Relative URLs are resolved from the build output; absolute URLs can be remote.

```sh
PUBLIC_SEED_URLS=/data/backup.json,https://cdn.example.com/other.json
```

Remote URLs require the server to send `Access-Control-Allow-Origin: *`.

Supported formats:

| Extension        | Source           | What's loaded                                          |
| ---------------- | ---------------- | ------------------------------------------------------ |
| `.json`          | `r4 backup`      | channel + all tracks                                   |
| `.txt`           | `r4 download`    | channel metadata + auto-discovers sibling `tracks.m3u` |
| `.m3u` / `.m3u8` | any M3U playlist | tracks (channel name taken from filename)              |

Imports are deduped — each channel is only parsed once. After first load the app works fully offline.

**What's absent in standalone** (no server):

- RSS feeds (`/[slug].rss`)
- `api/track-meta` endpoint
- Server-side embed redirect (handled client-side instead)

## Utility scripts

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
