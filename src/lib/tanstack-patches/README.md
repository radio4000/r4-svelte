# TanStack DB Patches

## useLiveQuery.svelte.js

**Issue:** `@tanstack/svelte-db@0.1.34` calls `flushSync()` inside a `$effect()`, which violates Svelte 5's async mode restriction.

**Error:** `Cannot use flushSync inside an effect` when `compilerOptions.experimental.async: true`

**Fix:** Removed the `flushSync` call at line 95 of the original implementation. Svelte 5's fine-grained reactivity handles status updates without needing synchronous flushing.

**Original code:**

```js
currentCollection.onFirstReady(() => {
	flushSync(() => {
		status = currentCollection.status
	})
})
```

**Patched code:**

```js
currentCollection.onFirstReady(() => {
	status = currentCollection.status
})
```

**Trade-offs:** Status updates might be delayed by microseconds, but this is negligible and allows compatibility with Svelte 5 async mode.

**Upstream:** Consider filing an issue with TanStack about Svelte 5 async mode compatibility.

**Remove this patch when:** TanStack DB releases a version compatible with Svelte 5 async mode.
