# App State Migration to TanStack Collections

## Migration Complete ✅

App state now uses TanStack DB `LocalStorageCollection` instead of reactive proxy pattern.

## Core Changes

### 1. app-state.svelte.ts

- Removed: `appState` proxy, `persistAppState()`
- Added: `useAppState()` hook for components
- Kept: `initAppState()` (initializes collection), `defaultAppState`

### 2. collections.ts

- `appStateCollection` already existed - no changes needed

### 3. +layout.svelte

- Removed: persistence `$effect`, `skipPersist` logic
- Uses: `useAppState()` hook
- Collection auto-persists and syncs across tabs

### 4. api.js & api/player.js

- All mutations now use `appStateCollection.update(1, draft => {...})`
- Reads use `appStateCollection.get(1)`

### 5. Components (player.svelte, theme-toggle.svelte)

- Import: `useAppState()` from `$lib/app-state.svelte`
- Import: `appStateCollection` from `$lib/collections` (for mutations)
- Pattern:

  ```svelte
  <script>
  	import {useAppState} from '$lib/app-state.svelte'
  	import {appStateCollection} from '$lib/collections'

  	const {data: appState} = useAppState()

  	// Reads: appState?.property
  	// Writes: appStateCollection.update(1, draft => { draft.property = value })
  </script>
  ```

## Remaining Files to Migrate

35 files still import from `$lib/app-state.svelte`. Pattern to follow:

### Read-only components

If component only reads appState:

```diff
- import {appState} from '$lib/app-state.svelte'
+ import {useAppState} from '$lib/app-state.svelte'
+ const {data: appState} = useAppState()
+ // Add ? to all appState.property → appState?.property
```

### Components with mutations

If component mutates appState:

```diff
- import {appState} from '$lib/app-state.svelte'
+ import {useAppState} from '$lib/app-state.svelte'
+ import {appStateCollection} from '$lib/collections'
+ const {data: appState} = useAppState()
+ // Reads: appState?.property
- appState.property = value
+ appStateCollection.update(1, draft => { draft.property = value })
```

## Benefits

1. **Single pattern** - consistent with channels/tracks collections
2. **Auto cross-tab sync** - built-in via LocalStorageCollection
3. **No layout coupling** - no persistence effects needed
4. **Transaction tracking** - can await `tx.isPersisted.promise` if needed
5. **Simpler mental model** - one way to handle all state

## Testing

- Verify app loads and persists state across refreshes
- Test cross-tab sync by opening multiple tabs
- Check player controls, theme toggle, queue panel
- Verify volume, shuffle, and other state persist correctly
