# App State Migration to TanStack Collections

## Migration Complete ✅

App state now uses TanStack DB `LocalStorageCollection` with a **Proxy pattern** for clean read/write syntax.

## Core Changes

### 1. app-state.svelte.ts

- Uses Proxy pattern: `useAppState()` returns a proxy with property accessors
- Getter: Returns reactive `$derived` value from collection
- Setter: Calls `appStateCollection.update(1, draft => {...})`
- Kept: `initAppState()` (initializes collection), `defaultAppState`

### 2. collections.ts

- `appStateCollection` - LocalStorageCollection, auto-persists and syncs across tabs

### 3. +layout.svelte

- Removed: persistence `$effect`, `skipPersist` logic
- Calls: `initAppState()` on mount
- Collection handles persistence automatically

### 4. api.js & api/player.js

- Direct reads: `appStateCollection.get(1)`
- Mutations: `appStateCollection.update(1, draft => {...})`

### 5. Components (player.svelte, theme-toggle.svelte, etc.)

**Current pattern (Proxy):**

```svelte
<script>
	import {useAppState} from '$lib/app-state.svelte'

	const appState = useAppState()

	// Read (reactive): {appState.volume}
	// Write: appState.volume = 0.5
</script>
```

The Proxy handles both reads and writes transparently. No need to import `appStateCollection` in components.

## Remaining Files to Migrate

Files still using old patterns can be migrated to the Proxy pattern:

### Migration Pattern

**Old pattern:**

```svelte
<script>
	import {appState} from '$lib/app-state.svelte'
	// Direct property access (old proxy)
	{
		appState.volume
	}
	appState.volume = 0.5
</script>
```

**New pattern (current):**

```svelte
<script>
	import {useAppState} from '$lib/app-state.svelte'

	const appState = useAppState()

	// Read: {appState.volume}
	// Write: appState.volume = 0.5
</script>
```

**Note:** Both read and write work directly on the proxy. No `?.` needed for property access since the proxy handles undefined gracefully.

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
