# The R4 universe in three layers

WHAT EXISTS → Channel, Track, Meta
WHAT YOU DO WITH IT → View, Play
WHAT HAPPENS LIVE → Deck, Broadcast, Auto-radio

## Layer 1: what exists

Channel → Track(URL) → Meta

A channel is whoever you want to be — a name, a taste made persistent, a growing list of references. A track is a pointer with opinions: "this thing lives at this URL, I call it this, I'd tag it #dub." You never host the media. You reference and annotate. Meta is what other systems know about that pointer — duration from YouTube, artist from MusicBrainz, pressing year from Discogs. It helps; it does not define your taste.

## Layer 2: what you do with it

Search → View → Tracks → Queue

A search is a view that hasn't been named yet. A saved view is a search that earned a name. A pinned view earned a place in the navigation. Each is the same shape — a query (@oskar #jazz miles) that filters, sorts, and narrows tracks into a queue. Four jobs, one shape. The difference is just how long you want to keep it.

## Layer 3: what happens now

Queue → Deck → Sound

A deck performs a queue. Broadcast shares that deck in real time — same track, same second, across whoever is listening. Auto-radio is the same shared timeline without a broadcaster.

## The whole picture

```
WHAT EXISTS          WHAT YOU DO WITH IT       WHAT HAPPENS LIVE
─────────────        ──────────────────────    ─────────────────────

User → Channel       Search / View             Deck
         ├─ Track      query → view → tracks     queue → player → sound
         ├─ Follow     save  → pin  → nav
         └─ Mention                            Broadcast (live DJ)
                     Play History                 broadcaster → listeners
Track Meta (local)     what, when, why
  YouTube / MB / DC                            Auto-radio (no DJ)
                                                 same track, same second
```

## Layer 1: what exists

```
        sign up / sign in (password, OTP, OAuth)
                      │
                      ▼
User ──owns──→ Channel ──has many──→ Track ──has many──→ Tag
                  │                    │
                  ├──has many──→ Follow (→ followers / following pages)
                  │
                  └──mentioned by──→ Track.description (@slug → /@slug/mentions)

                                   Track.url
                                     │
                                     ▼
                                   media-now: parseUrl → {provider, id}
                                     │
                                     ▼
                                   Track Meta (local only)
                                     ├─ YouTube (duration, title)
                                     ├─ MusicBrainz (artist, release)
                                     └─ Discogs (detailed release)
                                           ↑
                                 MB ──MBID chain──→ Discogs
```

## Layer 2: what you do with it

```
"@oskar #jazz miles"
       │
       ▼
  parseSearchQueryToView
       │
       ▼
     View {channels, tags, search, order, limit}
       │
       ├──remote──→ searchChannels / searchTracks (FTS)
       ├──local───→ fuzzySearch (channels in memory)
       │
       ▼
  processViewTracks
    tag filter → fuzzy match → sort → limit
       │
       ▼
  Filtered tracks ──→ results
       │                  │
       ▼                  ▼
  Play / Queue        Save → Saved View → Pin → Pinned View → sidebar
```

How filtered tracks become playback:

```
  Filtered tracks
       │
       ├─ playChannel ────→ set full queue, play first
       ├─ playFromHere ───→ set queue from this track onward
       ├─ shufflePlay ────→ random start + shuffle queue
       ├─ joinAutoRadio ──→ deterministic live radio (see layer 3)
       │
       └─ addToPlaylist / playNext ──→ append or insert into existing queue
```

## Play history

```
  playTrack(deckId, trackId, reason_start)
       │
       ├──→ addPlayHistoryEntry (records: track, started_at, reason_start)
       │
       ···track plays···
       │
       └──→ endPlayHistoryEntry (records: ended_at, ms_played, reason_end, skipped)

  Reasons capture the edges between player states:
    start: user click, next/prev, auto_next, play_channel, broadcast_sync, track_error
    end:   track_completed, user stop, next/prev, playlist_change, broadcast_sync, error
```

## Layer 3: what happens live

```
  Queue ──→ Deck ──→ Player (YouTube / SoundCloud / audio)
              │         │
              │         └── track ended ──→ next ──→ Player
              │                                        │
              │                                        └──→ Play History entry
              │
              ├── play / pause / seek
              │
              ├── Broadcast (live DJ)
              │     DJ side:       startBroadcast → deck state → remote row
              │     Remote:        realtime subscription pushes changes
              │     Listener side: joinBroadcast → mirror deck state → player
              │                    leaveBroadcast → stop mirroring
              │     Drift:         listener seeks/skips → listening_drifted
              │
              └── Auto-radio (no DJ)
                    tracks → toAutoTracks (need duration)
                           → epochFromTracks (oldest created_at)
                           → weeklyShuffle (seeded by epoch + week + view)
                           → playbackState (elapsed % total duration)
                           → same track, same second, every client
                    Drift: user deviates → auto_radio_drifted → resync button
                    View:  deck stores the view → different filters = different shuffle
```

## Deck state (grouped)

```
  Deck
    playlist:   what's queued, what's playing
    playback:   playing, volume, speed, shuffle
    layout:     compact | expanded, video visible, queue panel visible
    broadcast:  which channel this deck is broadcasting
    listening:  which broadcast this deck is tuned to, drift state
    auto-radio: active, drifted, rotation epoch, view (for resync + seed)
```

## Data flow

```
  Remote (Supabase PostgreSQL)
      │
      ▼
  Query Cache (IndexedDB) ──→ survives refresh, enables instant UI
      │
      ▼
  Collection (in-memory) ──→ tracks, channels, follows, broadcasts
      │
      ▼
  useLiveQuery ──→ reactive, updates when collection changes
      │
      ▼
  Component

  appState (localStorage) ──→ decks, user, display prefs, queue contents
  trackMetaCollection (localStorage) ──→ YouTube/MB/Discogs data
  playHistoryCollection (localStorage) ──→ listening history
  viewsCollection (localStorage) ──→ saved/pinned views
```

## Visibility

```
  PUBLIC      Channel, Track, Follow, Broadcast
  PRIVATE     Track Meta, Play History, App State, User, Saved Views
  SHAREABLE   View (private today, URLs by nature)
```

## Outputs

```
  Channel ──→ /@slug.rss (RSS feed)
         ──→ /@slug/backup (data export)
         ──→ /@slug/map (geographic view)
```
