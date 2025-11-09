# Automerge vs PGlite Exploration

## Test Route

Visit `/automerge-test` to explore the working prototype.

**Quick Start:**

1. Click "Load oskar channel" or "Load ko002 channel" to fetch real data
2. Wait for tracks to load (will show count in stats)
3. Try searching for track titles/descriptions
4. Adjust "Show" limit (50, 200, 1000, All) to test rendering performance
5. Use browser DevTools Performance tab to profile
6. Compare filter speed vs SQL queries in PGlite

## Key Findings

### ✅ What Works Well

1. **IndexedDB Persistence** - Works out of the box, persists across page loads
2. **Svelte Reactivity Bridge** - Simple pattern:
   ```javascript
   let doc = $state(null)
   handle.on('change', ({doc: newDoc}) => {
   	doc = newDoc // Triggers Svelte reactivity
   })
   ```
3. **CRDT Merging** - Automatic conflict resolution is genuinely magical
4. **Document URL Sharing** - Built-in, shareable URLs for documents
5. **Simple API** - Easier than SQL for simple CRUD operations

### ⚠️ Critical Tradeoffs

#### 1. **No SQL = All Operations in JavaScript**

**PGlite:**

```sql
SELECT * FROM tracks
WHERE channel_slug = 'ko002'
  AND title ILIKE '%ambient%'
ORDER BY created_at DESC
LIMIT 50;
```

**Automerge:**

```javascript
const tracks = doc.tracks
	.filter((t) => t.channel_slug === 'ko002')
	.filter((t) => t.title?.toLowerCase().includes('ambient'))
	.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
	.slice(0, 50)
```

- ❌ No indexes (every filter scans all data)
- ❌ No joins (must manually relate data)
- ❌ No complex queries (GROUP BY, aggregations, etc.)

#### 2. **All Data in Memory**

- PGlite: Lazy loads from WASM/disk
- Automerge: **Entire document in memory**

For 3k tracks, this might be fine (~500KB-1MB).
For 100k+ tracks, this becomes problematic.

#### 3. **Bundle Size**

Need to measure, but preliminary:

- PGlite WASM: ~3-5MB
- Automerge WASM: Likely smaller (~1-2MB?)
- But you lose SQL engine, so less functionality per byte

#### 4. **Performance with 3k Tracks**

**Rendering issue might not be PGlite's fault!**

The slow rendering you mentioned could be:

- ❌ Rendering 3k DOM nodes without virtualization
- ✅ NOT necessarily PGlite's query speed

Automerge won't fix rendering 3k items. You'd still need:

- Virtual scrolling
- Pagination
- Lazy loading

#### 5. **No Schema/Migrations**

**Good:**

- No migrations, just add/remove fields
- Very flexible

**Bad:**

- No validation
- No constraints (foreign keys, unique, etc.)
- Easy to create inconsistent data

#### 6. **History Overhead**

Automerge stores **all history** (like Git):

- Every change is persisted
- Can compact, but adds complexity
- History grows over time

PGlite just stores current state.

## When Would Automerge Make Sense?

### ✅ Good Fit:

- **Real-time collaboration** is the primary feature
- **Offline-first** with eventual sync
- **Moderate data size** (<10k items)
- **Simple queries** (no complex joins/aggregations)
- **Conflict resolution** is critical

### ❌ Not a Good Fit:

- Need SQL features (indexes, joins, aggregations)
- Large datasets (100k+ items)
- Complex relational data
- Need schema validation
- Storage efficiency is critical

## Hybrid Approach?

Could you:

1. Keep PGlite for **local storage & queries**
2. Use Automerge for **sync protocol only**?

Unfortunately, no. Automerge's CRDT requires storing data in Automerge format.

## My Recommendation

**Stick with PGlite, but optimize the rendering:**

1. **Use Virtual Scrolling** - Don't render 3k DOM nodes

   ```svelte
   import VirtualList from '@humanspeak/svelte-virtual-list'
   ```

2. **Paginate** - Load tracks in chunks

   ```sql
   SELECT * FROM tracks LIMIT 50 OFFSET 0;
   ```

3. **Optimize PGlite Loading**
   - Load WASM once, cache aggressively
   - Use IndexedDB persistence (already doing this)

4. **Profile the Real Bottleneck**
   - Is it PGlite query time?
   - Is it DOM rendering?
   - Is it WASM loading?

## Questions to Consider

1. **Do you need real-time collaboration?**
   - If no → PGlite is probably better
   - If yes → Automerge makes more sense

2. **How important is SQL?**
   - Joins, indexes, complex queries → Need SQL
   - Simple CRUD → Automerge is fine

3. **What's the actual bottleneck?**
   - WASM size? → Measure both
   - Query speed? → Probably not the issue
   - Rendering 3k items? → Need virtualization either way

## Next Steps

1. ✅ Test the `/automerge-test` route
2. ✅ Add 1000+ tracks and test search performance
3. ⚠️ Compare bundle sizes (need build)
4. ⚠️ Profile rendering with Chrome DevTools
5. 🤔 Decide if the tradeoffs are worth it

---

**My gut feeling:** The rendering issue is likely **not PGlite's fault**, and switching to Automerge won't solve it. You'd still need virtual scrolling or pagination. The real question is: **Do you need the CRDT collaboration features badly enough to give up SQL?**
