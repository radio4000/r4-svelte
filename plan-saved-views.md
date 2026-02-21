# Saved Views

## Context

Views (`src/lib/views.svelte.ts`) are the shared primitive for querying tracks — they power `/search` and `/_debug/views`. A `View` is a stateless recipe: `{channels, tags, tagsMode, search, order, direction, limit}` serialized to/from URL params.

This adds the ability to **save** views by name into a local collection (same localStorage pattern as play-history). Later could persist to PostgreSQL. Prototype on `/_debug/views`.

## Naming

- `View` — the runtime query/filter type (already exists, unchanged)
- `SavedView` — a named, persisted view. TypeScript interface only; everywhere else we just say "view"
- `viewsCollection` — the collection (parallel to `tracksCollection`, `channelsCollection`)
- Functions: `createView()`, `updateView()`, `deleteView()`

## UI: two-row bar with three states

### Row 1 (always visible)

```
[View1] [View2] [View3] [+ Add]          [Filters ▼] [Display ▼]
```

- Left: tabs for each saved view (`.active` when current URL params match)
- `+ Add` button to create a new view
- Right-aligned: Filter popover (channels, tags, tagsMode, search) + Display popover (SortControls + limit)

### State A — Idle

No row 2. User clicks view tabs to switch, or uses filter/display popovers to tweak.

### State B — Adding (clicked `+`)

```
Row 1: [View1] [View2] [View3] [+ Add]
Row 2: [name input] [Filters ▼] [Display ▼]     [Cancel] [Save]
```

- Row 1's Filter/Display popovers **hide** (row 2 has its own)
- Form starts **empty** — build the view from scratch
- Cancel closes row 2, Save creates the view and closes row 2

### State C — Dirty (changed filter/display without clicking `+`)

```
Row 1: [View1] [View2] [View3] [+ Add]          [Filters ▼] [Display ▼]
Row 2: channels: oskar · tags: jazz · order: created ↓     [Clear] [Save]
```

- `<p>` summarizing active filters + display
- Clear reverts to previous state (or clears all)
- Save always creates a **new** view (prompts for name). Updating an existing view is a separate action on the tab itself (e.g. context menu).

## Data

### SavedView type

```ts
interface SavedView {
	id: string
	name: string
	description?: string
	params: string // serializeView(view).toString()
	created_at: string
}
```

### Collection: `src/lib/tanstack/collections/views.ts`

localStorage-backed via `localStorageCollectionOptions` (same pattern as play-history).

- `viewsCollection`
- `createView(name, view, description?)` — insert, returns entry
- `updateView(id, updates)` — update name/description/params
- `deleteView(id)` — delete

### Storage key

Add `views: 'r5-views'` to `LOCAL_STORAGE_KEYS` in `src/lib/storage-keys.ts`.

### Barrel export

Add to `src/lib/tanstack/collections.ts`.

## Component: `src/lib/components/views-bar.svelte`

Props: `view` (current View from URL), `onchange(view: View)` (parent handles `goto`).

Internal:

- `useLiveQuery` on `viewsCollection` (custom version from `$lib/tanstack/useLiveQuery.svelte`)
- Active detection: `serializeView(view).toString() === sv.params`
- Three UI states driven by `let mode: 'idle' | 'adding' | 'dirty'`
- Reuses: `PopoverMenu`, `SortControls`, `Icon`, `.active` class, `tooltip`

## Navigation

Clicking a saved view uses **smart routing**:

- Single channel, no other filters → `/{slug}` (the channel page)
- Everything else → `/search?channels=...&tags=...`

A view is the universal primitive. A single-channel view is effectively a channel shortcut. The routing just does the right thing.

Helper: `navigateToView(view: View)` — resolves the destination and calls `goto`.

## Design decisions

- **`params` stored as string** — `serializeView(view).toString()`, not a View object
- **Smart routing** — single-channel view → `/{slug}`, everything else → `/search?...`
- **Save always creates new** — no implicit overwrite of active view
- **Add starts empty** — build from scratch using nested filter/display popovers
- **`+` always visible** — even when current filters match a saved view

## Integration: `src/routes/_debug/views/+page.svelte`

Add `<ViewsBar>` between header and existing forms. Existing debug forms stay below as secondary controls.

## Verification

1. `bun run check && bun run types`
2. Open `/_debug/views`, use filter/display popovers → row 2 appears with summary + clear/save
3. Click `+ Add` → row 2 switches to name input + nested popovers, row 1 popovers hide
4. Save a view → appears as tab, row 2 closes
5. Click a view tab → URL updates, tracks reload
6. Tweak filters while a view is active → dirty state, row 2 shows diff + clear/save
7. Refresh → views persist (localStorage)
