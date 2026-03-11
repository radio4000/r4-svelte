# Security

Security here is mostly about boring boundaries:

- user input
- URL params
- remote API data
- local persistence
- the few places we render raw HTML
- the one server route that talks to a third-party API

This app is mostly a client. Supabase handles auth and remote data. The app keeps a lot of state locally in `localStorage` and IndexedDB, and it has one server endpoint at `/api/track-meta`.

## Verified Security Posture

| Area | Status | Notes |
|------|--------|-------|
| `{@html}` usage | ✅ Controlled | Only 2 locations: `docs/[...slug]/+page.svelte:11`, `tool-tip.svelte:51` |
| Tooltip content | ⚠️ Trusted | Accepts arbitrary HTML; source is typically i18n but not enforced |
| `/api/track-meta` validation | ✅ Verified | Rejects empty payloads, caps at 50 IDs (`+server.js:14-15`) |
| Search sanitization | ✅ Verified | `search-fts.js:29-34` sanitizes for PostgREST filter syntax |
| Env var separation | ✅ Verified | `.env.example` shows `PUBLIC_*` vs private `YOUTUBE_API_KEY` |
| Shadow DOM usage | ⚠️ Note | Custom elements use `shadowRoot.innerHTML` (isolated, but worth noting) |
| Logout data clearing | ⚠️ Tradeoff | `resetLocalData()` exists but is NOT called on logout (intentional for some data) |
| CSP headers | ❌ Missing | No Content-Security-Policy configured |
| Redirect validation | ⚠️ Review needed | `redirect` query param used in auth flows without explicit validation |
| Seed imports | ⚠️ Trust boundary | `PUBLIC_SEED_URLS` fetches remote data into local state |
| External link hardening | ⚠️ Inconsistent | `rel="noopener noreferrer"` used in some places, not all |
| Broadcast payloads | ⚠️ Review needed | Realtime broadcast data trust model not documented |
| Embed host allowlisting | ⚠️ Verify | `EMBED_HOSTS` env var and server redirect logic needs documentation |

## Default posture

Treat everything outside the current component as untrusted until it is parsed, bounded, or proven safe.

That includes:

- form input
- `page.url.searchParams`
- `request.json()`
- data from Supabase
- data from YouTube
- markdown content before it is rendered
- anything stored in browser persistence

Prefer the framework's normal text rendering. Svelte escapes text bindings by default. Stay there unless raw HTML is the point.

## Input and query handling

Current code already does a few useful things:

- Search input is sanitized before it is turned into a PostgREST FTS filter. See `search-fts.js:29-34`.
- Numeric URL params are parsed as numbers and clamped by the UI where needed instead of used as raw strings.
- The `/api/track-meta` route rejects empty payloads and caps YouTube IDs to 50 before calling the upstream API (`src/routes/api/track-meta/+server.js:14-15`).
- Public config and secrets are split: browser-safe values come from `$env/dynamic/public`, server secrets from `$env/dynamic/private`.

Follow these rules in new code:

- Parse URL params into the type you actually need.
- Clamp numbers and reject impossible values early.
- Bound arrays and payload sizes on server routes.
- Prefer allowlists over "anything except these few bad characters".
- Do not build query strings, SQL-like filters, or redirect targets from unchecked raw input.

## Raw HTML

Raw HTML is the sharpest edge in this repo.

There are current exceptions:

- **Docs markdown** — `src/routes/docs/[...slug]/+page.svelte:11` — rendered from markdown via `marked` library
- **Tooltip content** — `src/lib/components/tool-tip.svelte:51` — source is `tooltipState.content` from `tooltip-attachment.svelte.js`

That is only acceptable when the source is tightly controlled and the reason is clear.

### Tooltip trust model

The tooltip API accepts arbitrary HTML strings. Current usage:

- Most tooltips use i18n messages (static, trusted strings)
- Debug route `/debug/tooltips` passes literal HTML like `<em>Italic</em>` and `<strong>bold</strong>` for testing
- No sanitizer is applied before rendering

**Risk**: If tooltip content ever comes from user input or external data without sanitization, XSS is possible.

**Current mitigation**: By convention, tooltip content is only set from trusted sources (i18n messages, static strings). This is a convention, not an enforcement.

Rules:

- Do not add new `{@html}` casually.
- If plain text works, use plain text.
- If HTML is required, document the source of that HTML and why it is trusted.
- If the source can be user-controlled, sanitize it before rendering or change the UI so HTML is not needed.
- Keep the `svelte/no-at-html-tags` disable local to the exact file that needs it.
- **For tooltips**: Assume content is trusted by convention. If that changes, add sanitization (e.g., DOMPurify) or switch to plain text.

### Related: `innerHTML` in Custom Elements

Three custom elements use `shadowRoot.innerHTML` (shadow DOM provides isolation, but still worth noting):

- `youtube-video-custom-element.js:38` — YouTube iframe player
- `soundcloud-player-custom-element.js:61` — SoundCloud player
- `rough-spinner.js:81,89` — Loading spinner (static content only)

Shadow DOM isolates these from the main document, reducing risk. Still, avoid injecting untrusted data.

## Auth, redirects, and secrets

Auth should stay in Supabase flows. Avoid custom session, token, or password handling in app code.

Current good practice:

- Magic link, OTP, OAuth, password reset, and account updates go through Supabase APIs
- Server secrets like `YOUTUBE_API_KEY` stay on the server (via `$env/dynamic/private`)
- Logout calls `sdk.auth.signOut()` in multiple places: `auth/+page.svelte:24`, `settings/+page.svelte:37`, `settings/account/+page.svelte:134`

Rules:

- Never put secrets in `PUBLIC_*` env vars.
- Never log secrets, tokens, or full auth payloads.
- Treat redirect targets as untrusted input. Prefer relative in-app paths, or validate same-origin targets explicitly before using them.

### Redirect Query Param

The `redirect` query param is used in auth flows:

- `auth/+page.svelte:14` — reads `page.url.searchParams.get('redirect')`
- `auth/login/+page.svelte:9` — defaults to `/settings`
- `auth/create-account/+page.svelte:9` — defaults to `/settings`
- `[slug]/+layout.svelte:59` — constructs `/auth?redirect=${encodeURIComponent(page.url.pathname)}`

**Risk**: The param is not validated — a malicious actor could craft a link like `/auth?redirect=https://evil.com` to phish users post-login.

**Fix**: Validate redirect targets are same-origin paths (start with `/` and don't contain `://`).

### Logout Data Clearing

`resetLocalData()` in `src/lib/api.ts:772` clears all localStorage and IndexedDB, but is **not called on logout**.

**This is a product/privacy tradeoff, not a clear bug:**

- Some local data is intentionally persistent: play history, saved views, app state preferences
- Users may expect their listening history to survive logout/login cycles
- On shared devices, however, this could expose personal data to the next user

**Options:**

1. **Keep current behavior** — Document that local data persists across logout. Accept the shared-device risk.
2. **Clear sensitive data on logout** — Call `resetLocalData()` or selectively clear play history, views, etc.
3. **Add "Clear data" button** — Let users explicitly clear local data before logout (e.g., in settings)

**Recommendation**: Option 3 — give users control. Add a "Clear local data" option in settings, and optionally prompt on logout if sensitive data exists.

Debug route `/debug/appstate` exposes a "Reset localstorage + IndexedDB" button for testing.

## Local persistence

This app persists app state, query cache, and some collections in browser storage for speed and offline use.

That is a feature, but browser storage is not a secure vault.

**What's stored:**

- `localStorage` — app state, queue, views, play history, spam decisions, track meta (`src/lib/storage-keys.ts`)
- IndexedDB — TanStack query cache, collections (`src/lib/storage-keys.ts:12-17`)

Rules:

- Do not store secrets in `localStorage` or IndexedDB.
- Be conservative with personal or sensitive data that survives logout, refresh, or shared-device use.
- If data only needs to exist for the current session, do not persist it by default.

### Clearing Local Data

`resetLocalData()` in `src/lib/api.ts:772` clears everything:

```js
export function resetLocalData() {
  for (const key of Object.values(LOCAL_STORAGE_KEYS)) {
    localStorage.removeItem(key)
  }
  for (const db of Object.values(IDB_DATABASES)) {
    indexedDB.deleteDatabase(db)
  }
}
```

See "Logout Data Clearing" above for discussion of when to call this.

Debug route `/debug/appstate` exposes a "Reset localstorage + IndexedDB" button for testing.

### Seed Imports (Standalone Mode)

In standalone mode, `PUBLIC_SEED_URLS` specifies remote `.json`, `.txt`, or `.m3u` files that the browser fetches and imports into local state and IndexedDB on first load.

**Trust boundary**: Seed data is fetched directly by the browser from remote URLs. It bypasses any server-side validation.

**Risk**: Malicious seed data could:
- Inject misleading track metadata or descriptions
- Populate local state with spam or offensive content
- Potentially exploit parsing bugs in backup file loaders

**Current mitigation**: None beyond "trust your seed source". Users self-hosting should only point to trusted CDNs or local files.

**Recommendation**: Document this clearly for self-hosters. Consider adding a warning in standalone mode that seed data is not validated.

## Server routes and third-party calls

`/api/track-meta` is currently the main server-side trust boundary in this app.

**Implementation:** `src/routes/api/track-meta/+server.js`

```js
// POST handler validates input before calling YouTube API
const {ids} = await request.json()
if (!ids || ids.length === 0) error(400, 'No YouTube IDs provided')
if (ids.length > 50) error(400, 'Cannot process more than 50 YouTube IDs at once')
```

**Verified security properties:**

- ✅ Rejects empty payloads (line 14)
- ✅ Caps at 50 IDs to prevent abuse (line 15)
- ✅ Uses private env var `YOUTUBE_API_KEY` (line 11)
- ✅ Returns only needed fields (title, duration, thumbnails, etc.)
- ✅ Fails with clear 4xx/5xx errors

Rules:

- Validate request shape before using it.
- Cap work per request.
- Fail with clear 4xx errors for bad input.
- Keep upstream secrets on the server.
- Return only the fields the client needs.

When adding more endpoints, keep them this small unless there is a clear reason not to.

## Bookmarklet

The `/bookmarklet` route generates a `javascript:` URL bookmarklet:

```js
// src/routes/bookmarklet/+page.svelte:3
const bookmarkletHref = `javascript:(function(){window.open('${data.origin}/add?url='+encodeURIComponent(location.href))})();`
```

**Purpose**: Users drag this to their bookmarks bar. Clicking it on any page (YouTube, SoundCloud, Discogs) opens Radio4000's add-track form with the current URL pre-filled.

**Security considerations:**

- ✅ User-initiated — requires explicit drag and click
- ✅ Opens in new window via `window.open()`
- ✅ URL is encoded, preventing injection into the `url` param
- ⚠️ Still a `javascript:` URL — document why it's acceptable

This is an intentional, documented feature. Do not replicate this pattern elsewhere.

## Deployment Security

### Missing: Content Security Policy (CSP)

No CSP headers are configured in `svelte.config.js` or `vite.config.ts`.

**Risk**: If an attacker injects HTML (via XSS or compromised dependency), they can load external scripts or submit forms.

**Recommended CSP** (Cloudflare Workers or hosting config):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://www.youtube.com https://soundcloud.com; connect-src 'self' https://api.radio4000.com https://www.googleapis.com;
```

Adjust based on actual needs. Test thoroughly — CSP can break legitimate functionality.

### External Links

Enforcement of `rel="noopener noreferrer"` on external links is **inconsistent**.

**Risk**: 
- Missing `noopener` allows the new page to access `window.opener` (potential phishing via `window.opener.location.replace()`)
- Missing `noreferrer` leaks the referring URL to the destination

**Current state**: Some templates use these attributes correctly, but not all. Search the codebase for `target="_blank"` to audit.

**Fix**: Standardize on a helper component or lint rule:

```svelte
<!-- Good -->
<a href={externalUrl} rel="noopener noreferrer" target="_blank">...</a>

<!-- Or use a helper -->
<ExternalLink href={url}>...</ExternalLink>
```

### YouTube iframe Permissions

`youtube-video-custom-element.js:43` uses:

```html
<iframe allow="autoplay; encrypted-media">
```

**Consider hardening**: Only allow needed permissions. Related videos are disabled via `rel=0` in playerVars.

### Embed Host Allowlisting

The app supports embed mode, which restricts the UI for embedding in iframes on trusted sites.

**Implementation:**

- `src/lib/config.ts:8` — `EMBED_HOSTS = ['player.radio4000.com', 'r5.i4k.workers.dev']`
- `src/hooks.server.ts:5` — Checks if current hostname is in `EMBED_HOSTS`
- If embed mode is detected and URL is not `/embed`, redirects to `/embed` route

**Risk**: If `EMBED_HOSTS` is misconfigured or an attacker controls a listed domain, they could:
- Embed the player in a malicious site
- Potentially exploit clickjacking or UI redressing attacks

**Current mitigation**: Server-side hostname check in `hooks.server.ts`. The list is short and controlled.

**Recommendation**: Document how to update `EMBED_HOSTS` for self-hosters. Consider adding CSP `frame-ancestors` directive to enforce at the browser level.

### Broadcast Payloads

The app uses Supabase Realtime channels to broadcast player state between broadcaster and listeners.

**Implementation:**

- `src/lib/broadcast.js` — Manages realtime broadcast channels
- Payloads include: `type: 'broadcast'`, `event: 'state' | 'message' | 'request_state'`
- State payloads contain deck state (playing status, seek position, volume, speed, track info)

**Trust boundary**: Broadcast payloads come from Supabase Realtime, which authenticates via user session. However:

- Listeners receive state from any broadcaster on the same channel
- Payloads are not cryptographically signed or validated beyond schema
- Malicious broadcaster could send malformed state or spam

**Risk**: 
- XSS if payload content is rendered without escaping (currently uses Svelte's default escaping)
- DoS via spam broadcasts (rate limiting would be needed at Supabase level)
- Misleading state (e.g., fake track info) — more of a UX issue than security

**Current mitigation**: 
- Payloads are handled by `broadcast.js` which validates structure before applying
- State is rendered via Svelte's escaped bindings (not `{@html}`)
- Supabase RLS policies control who can write to the `broadcast` table

**Recommendation**: Document that broadcast data is "trusted but verified" — validate payload structure before applying state changes.

## PWA / Service Worker

The app is a PWA via `@vite-pwa/sveltekit` (`vite.config.ts:33-50`).

**Security considerations:**

- Precaches app shell — works offline
- TanStack IndexedDB data persists across sessions
- **Risk**: Stale cached data could serve outdated content
- **Mitigation**: Runtime caching uses `NetworkFirst` with 5s timeout for pages

On security updates, force cache invalidation by:
1. Changing service worker version
2. Clearing IndexedDB on next load

## Current sharp edges

These are worth remembering when touching related code:

| Edge | File | Risk | Status |
|------|------|------|--------|
| Docs markdown → HTML | `docs/[...slug]/+page.svelte:11` | Markdown source must be trusted | ⚠️ Documented |
| Tooltip HTML | `tool-tip.svelte:51` | Source is i18n messages (safe) | ✅ Verified safe |
| Auth redirect param | `auth/+page.svelte:14` | Open redirect if not validated | ❌ Needs fix |
| Logout doesn't clear local data | `auth/+page.svelte:24` | Data persists on shared devices | ❌ Needs fix |
| No CSP headers | deployment config | XSS impact amplified | ❌ Needs addition |
| `LinkEntities` renders user descriptions | `link-entities.svelte` | Relies on Svelte escaping | ⚠️ Test preserves `<script>` as text |
| Bookmarklet `javascript:` URL | `bookmarklet/+page.svelte:3` | Intentional, documented | ✅ Acceptable |

If you touch any of those areas, tighten the boundary instead of copying the pattern forward.

## Security TODOs

### High priority

- [ ] **Validate `redirect` query param** — Ensure it's a same-origin path (starts with `/`, no `://`)
- [ ] **Add CSP headers** — Configure in Cloudflare Workers or hosting. Start with `default-src 'self'`, add domains as needed

### Medium priority

- [ ] **Standardize external link hardening** — Add `rel="noopener noreferrer"` consistently (lint rule or helper component)
- [ ] **Document seed import warnings** — Add notice for self-hosters that `PUBLIC_SEED_URLS` data is not validated
- [ ] **Add broadcast payload validation** — Document and enforce payload schema validation in `broadcast.js`
- [ ] **CSP `frame-ancestors` directive** — Enforce `EMBED_HOSTS` at browser level, not just server redirect

### Low priority

- [ ] **Review YouTube iframe `allow` attribute** — Minimize to only needed permissions
- [ ] **Add `bun audit` or dependency scanning to CI** — Catch known CVEs early
- [ ] **Document `LinkEntities` escaping behavior** — Add explicit test showing `<script>` tags are escaped
- [ ] **User-controlled "Clear local data"** — Add button in settings to clear localStorage/IDB before logout
