# Data and state

## Remote

Supabase PostgreSQL is the source of truth. Access via `@radio4000/sdk` or the `r4 --help` CLI.

## Local sync

Data syncs to the browser via TanStack DB collections. These provide reactive, queryable in-memory stores with offline-first mutations. See [tanstack.md](tanstack.md) for the deep-dive.

## App state

`appState` is a Svelte-reactive global object persisted to localStorage. Holds player state, queue, user settings - anything that should survive page refresh but isn't synced to the server.

## Legacy

v1 channels from Firebase are read-only. See [v1-data.md](v1-data.md).
