# PR 132 Review — Data Loading Patterns & Duplicated Code

Skipping 3D/OGL internals. Focused on data loading, state derivation, normalization, and code duplication.

---

## 1. `channel-ui-state.js` shouldn't exist — it's global derived state

`deriveChannelActivityState` is a pure function whose inputs are **all global singletons**:
- `appState.decks` — global `$state`
- `tracksCollection.state` — global `$state` Map
- `channelsCollection.state` — global `$state` Map
- `followsCollection.state` — global `$state` Map
- `broadcastsCollection.state` — global `$state` Map

Yet 4 components each independently create 2 `useLiveQuery` calls (just mirroring `.state`), rebuild a `followsState` Map from results (`.state` is already that Map), and call the pure function with the same global data. Should be **one global `$derived`**, computed once, near `appState`:

```js
// e.g. in app-state-derived.svelte.ts, or in app-state.svelte.ts
export const channelActivity = $derived.by(() => ({
    ...deriveChannelActivityState({
        decks: appState.decks,
        tracksState: tracksCollection.state,
        channelsState: channelsCollection.state,
        followsState: followsCollection.state,
        broadcastRows: [...broadcastsCollection.state.values()]
    })
}))
```

That deletes `channel-ui-state.js`, `channel-canvas-state.js` (thin wrapper, possibly dead already), the 4 copies of `deckCanvasState` + **8 redundant `useLiveQuery` subscriptions**, all the normalize functions inside it, and the `followsState` Map-rebuilding duplicated in every consumer. `followsCollection.state` is already a `Map<string, {id: string}>` — exactly what `deriveChannelActivityState` needs.

---

## 2. `deckCanvasState` derivation copy-pasted 4 times

*Falls out of #1.*

The same ~18-line block appears verbatim in:

| File | Lines |
|------|-------|
| `src/lib/components/channels-view.svelte` | 31–50 |
| `src/lib/components/channels.svelte` | 57–79 |
| `src/lib/components/map-channels.svelte` | 41–61 |
| `src/routes/[slug]/image/+page.svelte` | 24–53 |

Each instance creates **2 live queries** (follows + broadcasts) and builds the same `followsState` Map the same way. That's 8 independent subscriptions to the same 2 collections doing identical work.

```js
// This exact block exists 4 times:
const followsQuery = useLiveQuery((q) => q.from({follows: followsCollection}))
const broadcastsQuery = useLiveQuery((q) => q.from({b: broadcastsCollection}))
const deckCanvasState = $derived.by(() => {
    const followsRows = followsQuery.data ?? []
    void tracksCollection.state.size
    void channelsCollection.state.size
    const followsState = new Map(
        followsRows
            .map((row) => ({id: typeof row === 'string' ? row : row?.id}))
            .filter((row) => typeof row.id === 'string')
            .map((row) => [row.id, row])
    )
    return deriveChannelActivityState({
        decks: appState.decks,
        tracksState: tracksCollection.state,
        channelsState: channelsCollection.state,
        followsState,
        broadcastRows: broadcastsQuery.data ?? []
    })
})
```

---

## 3. `void collection.state.size` — reactivity hack, used inconsistently

*Falls out of #1.*

`void tracksCollection.state.size` forces Svelte 5 to track `$state(Map).size` so `$derived` re-evaluates on add/remove. Appears in the `deckCanvasState` derivation (4 files) plus `player.svelte`, `deck-compact-bar.svelte`, `broadcast-controls.svelte`.

Likely redundant for `channels`/`tracks` — `deriveChannelActivityState` already iterates `.values()` and does `.get()` lookups, which establishes the dependency. May be genuinely needed for `broadcasts` (read via `broadcastsQuery.data`, not `.state`).

Goes away entirely if activity state becomes a single global `$derived` reading `.state` directly (#1).

---

## 4. `[slug]/image/+page.svelte` ignores parent layout context

Every other `[slug]/*` child uses `getChannelCtx()` + `getTracksQueryCtx()` from the parent layout. The image page creates its own `channelQuery` (lines 17–23, duplicate of layout's `channelBySlugQuery`) and `channelTracksQuery` (lines 26–32, duplicate of layout's `tracksQuery`), plus 2 follows/broadcasts queries for `deckCanvasState` (#2). That's **4 redundant live queries**. Use the parent context.

---

## 5. Normalization functions — most are unnecessary

**The inputs are already normalized upstream:**
- `extractHashtags()` (utils.ts:75) → lowercase, `#`-prefixed
- `extractMentions()` (utils.ts:92) → lowercase, `@`-prefixed
- DB slugs → lowercase, trimmed
- `deck.view.tags` from `parseView()` → bare strings from URL params, no `#`
- `track.tags` from DB → bare strings, no `#`

### `normalizeTag` in `channel-ui-state.js:18–26` — mostly dead code

```js
function normalizeTag(value) {
    const token = String(value || '').trim().toLowerCase()
        .replace(/^[﹟＃]/, '#')    // fullwidth hash → ASCII hash
        .replace(/[.,;:!?]+$/g, '') // strip trailing punctuation
    if (!token) return ''
    return token.startsWith('#') ? token : `#${token}`
}
```

Fullwidth hash branch is dead (`extractHashtags` filters those out before they get here). Trailing punctuation strip is dead (neither source produces it). The only useful thing it does is add `#` to `deck.view.tags` bare strings — that's `'#' + tag`.

### `normalizeTag` in `[slug]/image/+page.svelte:79–84` — opposite behavior, same name

```js
function normalizeTag(value) {
    return String(value || '').trim().toLowerCase().replace(/^[#﹟＃]/, '')
}
```

Strips `#` for comparing against bare `track.tags`. Called on already-lowercase data. Just `.replace(/^#/, '')`.

### `normalizeSlug` in `map-channels.svelte:89–92` — not needed

```js
const normalizeSlug = (value) => String(value || '').trim().toLowerCase()
```

DB slugs are already lowercase and trimmed. Same pattern inlined 5× in `channel-ui-state.js`.

### `normalizeMention` in `[slug]/image/+page.svelte:86–91` — not needed

```js
function normalizeMention(value) {
    return String(value || '').trim().toLowerCase().replace(/^@/, '')
}
```

Inputs already lowercase. Only useful part is stripping `@` — that's `.slice(1)`.

### `normalizeBroadcastRow` in `channel-ui-state.js:7–13` — not needed, invents a phantom type

Handles `row.channels`, `row.channel`, `row.channel_id`, `row.id` as fallbacks — but broadcast data always comes from `broadcastsCollection`, populated by `readBroadcasts()` in `collections/broadcasts.js`. The Supabase select is:

```
channel_id, track_played_at, decks, channels:channels_with_tracks (*)
```

Shape is always `{channel_id, track_played_at, decks, channels: {...}}`. The fallback paths never execute.

Worse: invents a camelCase `trackPlayedAt` alias for `track_played_at`, then checks for `row?.trackPlayedAt` as input — a shape nothing produces. The only source of `trackPlayedAt` in the codebase is this function's own return value. `broadcasts/+page.svelte:97` then consumes it. Just use `row.track_played_at` directly.

### `normalizeChannels` — needed but duplicated

Dedupes by `id` after enrichment join (which can return dupes). Copy-pasted identically in `[slug]/followers/+page.svelte:28–36` and `[slug]/following/+page.svelte:28–36`.

### Verdict

| Function | Needed? | Action |
|----------|---------|--------|
| `normalizeTag` (channel-ui-state.js) | Barely — only adds `#` to view tags | Replace with `'#' + tag` inline |
| `normalizeTag` (image page) | Barely — only strips `#` | Replace with `.replace(/^#/, '')` or `.slice(1)` inline |
| `normalizeSlug` (map-channels) | No — slugs are already lowercase | Delete, use raw slugs |
| Inline slug normalization (channel-ui-state.js ×5) | No | Delete, use raw slugs |
| `normalizeMention` (image page) | No — mentions are already lowercase | Delete, use `.slice(1)` if stripping `@` |
| `normalizeBroadcastRow` | No — single data shape, and invents a camelCase `trackPlayedAt` alias that nothing produces | Delete, use `row.track_played_at` / `row.channels` directly |
| `normalizeChannels` (×2) | Yes but duplicated | Extract to shared util |

---

## 6. `activeChannelId` computed twice in `channels.svelte`

Lines 26–38 manually iterate decks to find the active channel ID:
```js
const activeChannelId = $derived.by(() => {
    for (const deck of Object.values(appState.decks)) {
        if (deck.listening_to_channel_id) return deck.listening_to_channel_id
        // ... manual lookup
    }
})
```

But `deckCanvasState` (lines 62–79) already produces `activeChannelIds` from `deriveChannelActivityState`, which does the same traversal. Use `deckCanvasState.activeChannelIds[0]` and delete this.

---

## 7. `toChannelCardMedia` — DTO for a boundary that doesn't exist

`channel-ui-state.js:129–154` builds a flat object per channel for the 3D renderer:

```js
return {
    url: base.url, width: base.width ?? 250, height: base.height ?? 250,
    slug: channel.slug, id: channel.id, name: channel.name,
    description: channel.description || '',
    tags, mentions, activeTags, activeMentions, hasActiveTagMatch,
    isActive, isPlaying, isFavorite, isLive,
    channel   // ← the whole channel object, again
}
```

- Copies `slug`, `id`, `name`, `description` from channel, then also attaches the whole `channel` — consumers get both `item.slug` and `item.channel.slug`.
- Re-extracts hashtags/mentions from `channel.description` on every call — two regex scans × N channels × every reactive update, in 3 components.
- The only new information vs the raw channel: image URL, boolean flags (`isActive`, `isPlaying`, `isFavorite`, `isLive`), and tag/mention matching.

If activity state is global (#1), the 3D renderer can take `channel[]` + look up state directly. No intermediate DTO needed.

---

## 8. `canvasMedia` mapping duplicated in 3 files

The same `toChannelCardMedia` call with identical placeholder URL:

| File | Lines |
|------|-------|
| `channels-view.svelte` | 73–83 |
| `channels.svelte` | 171–181 |
| `[slug]/image/+page.svelte` | 54–63 |

```js
// Identical in all 3:
toChannelCardMedia(c, deckCanvasState, {
    url: c.image
        ? channelAvatarUrl(c.image)
        : `https://placehold.co/250?text=${encodeURIComponent(c.name?.[0] || '?')}`,
    width: 250,
    height: 250
})
```

**Suggestion:** Move default URL logic into `toChannelCardMedia` itself or add a `toChannelCardMediaWithDefaults(channel, state)` wrapper.

---

## 9. `BroadcastDeckState` type duplicated from SDK

`src/lib/types.ts:100–113` redefines `BroadcastDeckState` instead of extending the SDK's version.

**SDK version** (`@radio4000/sdk`):
```ts
export interface BroadcastDeckState {
    index: number;         // required
    track_id: string | null;
    is_playing: boolean;   // required
    // ... all fields required
}
```

**App version** (`src/lib/types.ts`):
```ts
export interface BroadcastDeckState {
    index?: number;        // optional
    track_id?: string | null;
    is_playing?: boolean;  // optional
    // ... all fields optional
    // extra fields not in SDK:
    track_url?: string | null;
    track_title?: string | null;
    track_media_id?: string | null;
}
```

The app version makes all fields optional (handles partial deck state) and adds three extra fields for ephemeral/non-DB tracks. Extend instead of redeclare:
```ts
import type {BroadcastDeckState as SDKBroadcastDeckState} from '@radio4000/sdk'
export interface BroadcastDeckState extends Partial<SDKBroadcastDeckState> {
    track_url?: string | null
    track_title?: string | null
    track_media_id?: string | null
}
```
Or add the extra fields to the SDK type upstream.

---

## 10. Followers / Following pages are ~95% identical

`[slug]/followers/+page.svelte` and `[slug]/following/+page.svelte` share identical `normalizeChannels`, same `$effect` fetch-and-enrich pattern, same display/order/direction state, same template and CSS. Only differences: SDK method (`readFollowers` vs `readFollowings`), query key, heading text, empty-state message.

Extract a shared component or `loadChannelRelations(channelId, direction)` helper.

---

## 11. Canvas interaction handlers duplicated

`handleCanvasClick`, `handleCanvasDoubleClick`, the `openSlug` -> `selectedCanvasChannelId` sync `$effect`, and `setDisplay` are near-identical between `channels-view.svelte` and `channels.svelte`.

---

## 12. `viewIconMap` / `viewLabelMap` duplicated

Nearly identical maps in:
- `channels-view.svelte:118–130`
- `channels.svelte:221–235` (adds `tuner`)

**Suggestion:** Share from a module. The `tuner` entry can just be present — unused keys are harmless.

---

## Summary table

| # | What | Files | Fix |
|---|------|-------|-----|
| 1 | `channel-ui-state.js` + `channel-canvas-state.js` | 5+ files | One global `$derived` near appState |
| 2 | `deckCanvasState` + 2 live queries ×4 | 4 files | Falls out of #1 |
| 3 | `void collection.state.size` hacks | 6 files | Falls out of #1 |
| 4 | Image page ignores parent context | 1 file | Use `getChannelCtx()` + `getTracksQueryCtx()` |
| 5 | `normalizeTag` ×2, `normalizeSlug`, `normalizeMention`, `normalizeBroadcastRow` | 3 files | Delete — inputs already normalized upstream |
| 5 | `normalizeChannels` | 2 files | Extract to shared util |
| 6 | `activeChannelId` double-computed | channels.svelte | Use `deckCanvasState.activeChannelIds[0]` |
| 7 | `toChannelCardMedia` DTO | 3 files | Remove if activity state is global (#1) |
| 8 | `canvasMedia` placeholder URL | 3 files | Default in `toChannelCardMedia` |
| 9 | `BroadcastDeckState` type | types.ts vs SDK | Extend SDK type |
| 10 | Followers/Following pages | 2 files | Shared component or loader |
| 11 | Canvas click/dblclick handlers | 2 files | Shared or consolidate |
| 12 | `viewIconMap` / `viewLabelMap` | 2 files | Shared const |
