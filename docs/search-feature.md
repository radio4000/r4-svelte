# Search Feature

The /search page doubles as a command palette, accessible globally via Cmd+K. Type to search across channels and tracks, or use prefixes to navigate and execute commands. The search input uses native HTML5 datalist autocomplete populated with channel slugs and available commands.

## How It Works

Pressing Cmd+K anywhere in the app navigates to /search and focuses the input. The URL param is `?q=` (the raw human query string). The search executes different actions based on what you type. Channel navigation uses @ prefixes like @good-time-radio, while commands use / prefixes like /settings or /toggle-theme. You can also type bare words like "settings" which works as a shortcut to common pages.

The autocomplete suggestions come from a datalist element that loads all channel slugs from the tanstack collection plus the available commands. As you type, the browser's native autocomplete shows matching options. When you press Enter, the smart execution logic determines whether to navigate to a page, execute a command, or perform a regular search.

## Smart Execution Flow

The executeCommand function tries different patterns in order. First it checks for command prefixes like /settings or /toggle-theme and runs the corresponding function. Then it looks for channel navigation with @ prefixes and navigates to that channel page. It also handles bare shortcuts like typing "settings" to go directly to the settings page. If none of these patterns match, it falls back to regular search functionality.

## Search Sources

The `/search` page uses the reactive View pipeline (`parseSearchQueryToView` + `queryViewTracks`) for track results — same as the views debug page. Channel results (channel cards from `@slug` resolution and FTS) run as separate queries alongside.

Remote search (`searchChannels`, `searchTracks`) queries Supabase full-text search across all Radio4000 data. Local search (`searchTracksLocal`, `searchChannelsLocal`) uses fuzzysort against in-memory data for instant results on already-loaded collections.

```js
import {parseSearchQueryToView, queryViewTracks} from '$lib/views.svelte'
import {searchChannels, findChannelBySlug} from '$lib/search.js'

// /search parses ?q= into a View, then uses queryViewTracks for reactive cached tracks
const view = parseSearchQueryToView('@oskar #jazz miles')
// → {channels: ['oskar'], tags: ['jazz'], search: 'miles'}
```

The @mention syntax scopes track searches to specific channels. Typing `@ko002 jazz` searches for "jazz" only within that channel's tracks. Multiple mentions work too: `@ko002 @oskar house` searches tracks in both channels.

## Performance Considerations

Search only triggers for terms longer than 2 characters to avoid expensive queries on single characters. Local search is synchronous and instant since it operates on in-memory collections. Remote search is async and hits the network, so use it intentionally. After successful command execution, both the search query and results are cleared to avoid showing "No results found" messages.

## Files

The main search interface lives in src/routes/search/+page.svelte which handles the input, autocomplete, and smart execution logic. The global Cmd+K shortcut is registered in src/routes/+layout.svelte. Command functions like toggleTheme and toggleQueuePanel are defined in src/lib/api.js and imported into the search page to avoid code duplication. The search logic itself lives in src/lib/search.js.

## Integration Points

The search page uses the same reactive View pipeline as the views debug page. Track results flow through TanStack queries (`useLiveQuery` / `createQuery`) which write into `tracksCollection` — so data is cached and shared across pages. Channel results use `findChannelBySlug` (collection-first, SDK fallback) and `searchChannels` (FTS). The autocomplete populates from loaded channel slugs without requiring additional queries during typing.
