# Embed Player

> Replace the v1 `<radio4000-player>` custom element with a new embed strategy built on R5.

## Problem

The v1 player (`player.radio4000.com`, `<radio4000-player>`) is built on v1, and doesn't support our newer features. We want a clean slate and reuse R5 wherewever possible. R5 already has everything: deck view (player + queue + controls), broadcast auto-join, tag/text filtering, channel browsing. The embed should just be R5 in a trimmed-down mode.

## Open questions

### iframe vs. web component — or both?

**iframe only**

- Simplest. No JS dependency. Works everywhere, completely isolated.
- `<iframe src="https://player.radio4000.com/embed?slug=good-time-radio">` and done.
- No programmatic control from the host page (without postMessage).
- Fixed size unless the embed sends resize messages.

**Web component only**

- `<radio4000-player slug="good-time-radio">` — matches v1 API.
- Question: does it render inline (full Svelte bundle in the host page), or wrap an iframe internally?
  - **Inline**: heavy, imports all R5 deps into host page, CSS conflicts likely.
  - **Wraps iframe**: practical, good isolation — but it's still an iframe under the hood.
- Events and methods are nice: `player.play()`, `on('track:change', ...)`.

**Both (iframe + web component that wraps it)**

- This is how most embed widgets work (YouTube player, Twitter embeds, etc.).
- The web component is a thin JS file that creates the iframe, forwards attributes as URL params, and exposes a JS API via postMessage.
- Best of both: simplicity of iframe + nice developer API when needed.
- Two things to ship: the embed route in R5, and a small standalone `player.js` package.

Current lean: **both**. The iframe is the core primitive; the web component is optional sugar.

### What route/URL?

Option A: `/embed` route — separate layout, no nav/header.

```
https://player.radio4000.com/embed?slug=good-time-radio
```

Option B: URL param on any route — `?embed=1` strips chrome.

```
https://beta.radio4000.com/@good-time-radio?embed=1
```

Option A is cleaner — dedicated entry point, easier to maintain, clear contract.
`player.radio4000.com` would point to R5 and serve `/embed` as the root.

### What's shown in the embed?

`deck.svelte` as-is: player + queue panel + controls. No global header, no sidebar nav, no channel browser. That's already ~90% right.

Nice-to-have: a small "branding strip" linking back to radio4000.com (like old player had).

### URL param: ViewURI

The embed reads a single `?v=` param containing a ViewURI (see `docs/views.md`). This reuses the entire existing view infrastructure — no new param schema needed.

```
/embed?v=@good-time-radio
/embed?v=@good-time-radio #jazz?order=shuffle
/embed?v=@alice;@bob?order=shuffle
/embed?v=#ambient?order=shuffle&limit=50
```

`viewFromUrl(url)` already handles decoding. `getAutoDecksForView(view)` maps the view to deck seeds.

Multi-query views (`@alice;@bob`) could render one deck per query or one deck with a merged queue. Unresolved — needs design.

`?autoplay=true` is the only extra param (not part of ViewURI).

### Self-hosting / site player

The same embed URL works as a standalone page. `radio.example.org` can either:

- **Full R5 deploy**: self-host the whole app, configure it to scope to their channel(s) via env vars. Full browsing, history, auth — just filtered.
- **Embedded widget**: one `<iframe>` or `<radio4000-player>` on their page. No full app, just the player.

Both are valid and can use the same URL param strategy. No separate product needed.

### PostMessage API (for web component)

If we build the web component wrapper, what events and methods does it expose?

Outbound events (iframe → host):

- `track:change` — now playing changed
- `player:play` / `player:pause`
- `player:ended`

Inbound commands (host → iframe):

- `play` / `pause` / `next` / `prev`
- `seek(seconds)`

This is optional — only needed if embedders want programmatic control.

### Broadcast in the embed

The embed should auto-join broadcasts passively (like a listener), not start them. If the channel is broadcasting live, the embed syncs. This is already how R5 works — the embed just needs to not hide the broadcast UI.

## What exists today

- `channelEmbed(channel)` in `share.ts` — generates `<iframe src="${appPlayerUrl}/?slug=${channel.slug}">` pointing to `https://player.radio4000.com` (v1).
- `PUBLIC_APP_PLAYER_URL` env var — already abstract, just needs to point at R5.
- Share dialog already shows embed code to channel owners.
- `deck.svelte` is the right component to render in embed mode.

### localStorage isolation

The embed runs on the same origin as the main app (`radio4000.com`). localStorage is shared per origin — including across iframes. The `$effect.root` in `app-state.svelte.ts` writes deck state on every change. An embed iframe playing a track on a third-party site would silently overwrite the user's deck state on radio4000.com.

**Preferred solution: deploy to `player.radio4000.com`.**

Same SvelteKit codebase, second deployment, different origin. localStorage is isolated for free — no code changes needed. Root `/` redirects to `/embed`. The full app is technically present but not the entry point.

This also sets up `player.radio4000.com` as the canonical iframe src (matching what `channelEmbed()` has always generated), and gives a clean CSP story.

If same-domain deployment is needed first (dev, staging), `app-state.svelte.ts` can check `location.pathname.startsWith('/embed')` to skip `loadState()` and the persistence `$effect`. But subdomain is the right long-term answer.

## What needs to be built

1. `/embed` route + layout — no header, no auth, no sidebar.
2. Layout reads `?v=` (ViewURI) + optional `?autoplay=true`.
3. `viewFromUrl` → `getAutoDecksForView` → initialize scoped appState → render `<Deck>` per deck.
4. Update `channelEmbed()` in `share.ts` to generate `/embed?v=@{slug}` URLs.
5. (Optional, later) `player.js` — tiny web component wrapping the iframe + postMessage API.

## Not doing

- Full Svelte render inline in host page (too heavy, CSS conflicts).
- Custom theming/CSS injection into the embed.
- Multi-channel UI design in this spec — separate concern.
- Auth inside the embed (read-only, no login).
