# Deployment & CI

## Cloudflare (default)

After running `bun run build` you have everything inside the `./build` folder.

For this repository, Cloudflare is configured to deploy automatically:

- pushes to main go to https://beta.radio4000.com
- pull requests (non-draft) get their own, unique URL

## Standalone / self-hosted

The standalone build produces a static SPA that works on any web server (nginx, S3, Netlify, GitHub Pages, etc.) with no backend required.

### Setup

```sh
git clone https://github.com/radio4000/r4-sync-tests
cd r4-sync-tests
bun install
```

Configure your data sources in `.env` — this file is gitignored and never touched by `git pull`:

```sh
# .env
PUBLIC_APP_MODE=standalone
PUBLIC_SEED_URLS=/data/ko002.txt
```

Put your data files in `static/data/` (also gitignored):

```sh
mkdir static/data
# Option A — r4 download folder (audio + metadata):
cp ~/Music/radio4000/ko002/ko002.txt static/data/
cp ~/Music/radio4000/ko002/tracks.m3u static/data/   # optional, auto-discovered
# Option B — JSON backup:
r4 backup <slug> > static/data/backup.json
```

Then build and deploy:

```sh
bun run build:standalone
# deploy the build/ folder to any static host
```

### Updating

```sh
git pull
bun run build:standalone
```

Your `.env` and `static/data/` are untouched. No conflicts, ever.

### Multiple channels / remote data

`PUBLIC_SEED_URLS` is a comma-separated list. Each URL can be relative (served from `static/`) or absolute (remote server):

```sh
PUBLIC_SEED_URLS=/data/ko002.txt,/data/other-channel.json,https://cdn.example.com/backup.json
```

### Supported formats

| Extension | Source | What's loaded |
|---|---|---|
| `.json` | `r4 backup` | channel + all tracks |
| `.txt` | `r4 download` | channel metadata + auto-discovers sibling `tracks.m3u` |
| `.m3u` / `.m3u8` | any M3U playlist | tracks (channel name taken from filename) |

Remote URLs require the server to send `Access-Control-Allow-Origin: *`.

On first load the app imports all sources into IndexedDB and works fully offline. Imports are deduped — each channel is only parsed once.

**What's different in standalone mode (`PUBLIC_APP_MODE=standalone`):**
- Adapter: `@sveltejs/adapter-static` with `fallback: index.html` (SPA mode)
- Auth: Supabase subscription is skipped; auth routes exist but are non-functional (no backend)
- Seed: `/r4-seed.json` is auto-imported on startup if present
- All player, queue, and offline (PWA) features work as normal

**What's absent** (no server to serve them):
- RSS feeds (`/[slug].rss`)
- `api/track-meta` endpoint
- Server-side embed redirect (handled client-side instead)

## Utility scripts

Run `bun run check` to format and lint the entire code base.
Run `bun run knip` for additional reports on unused code etc.
Run `bun run types` to let Svelte check the project.
Run `bun run test` to run our tests.
Run `bun update -i` to interactively decide which dependencies to update, if any.
