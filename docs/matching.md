# Channel matching score (0-100)

Shown on channel homepages for signed-in users (not on own channel). Provides a transparent overlap score between **your main channel** and the viewed channel, with a brief breakdown.

File: `src/lib/channel-match-score.ts`

## Formula

`score = url_match + tag_match + artist_title_match`

Weights:

- `url`: `50` — exact track overlap (canonical URL or `provider:media_id`)
- `tag`: `30` — shared tags (curated taste signals, highest user-intent signal)
- `artistTitle`: `20` — shared `Artist - Title` pairs across both catalogs

`total = clamp(round(url + tag + artistTitle), 0, 100)`

## Inputs

For each channel we build three sets:

1. **URL key set** — `provider:media_id` when available, otherwise normalized URL string.
2. **Tag set** — all unique tags across all tracks, normalized to lowercase ASCII.
3. **Artist+Title set** — parses `Artist - Title` from track title; both parts must be present.

## Coverage overlap (directional)

For each dimension:

- `overlap = |A ∩ B|`
- `base = |B|` (viewed channel set size)
- `ratio = overlap / base`
- if `base = 0`: `ratio = 0` — no data means no score, not a free pass

Direction: **A = your channel**, **B = viewed channel**. Score answers "how much of this channel would I already know/like?"

Examples:

- Same channel vs itself: `100%`
- Viewed channel is a strict subset of yours: `100%`
- You are a subset of viewed channel: `< 100%`
- Viewed channel has no parseable tags: tag dimension contributes `0` (not `30`)

## Display

Shown as: `{total}% · {label}` with per-dimension breakdown (`tracks`, `tags`, `artists`).

Labels by range: `low overlap` (0–19), `some overlap` (20–44), `good match` (45–74), `strong match` (75–100).

Dimensions only shown when `base > 0` (i.e., the viewed channel has data for that dimension).

## Why this model

- deterministic and explainable
- cheap to compute client-side from already-loaded track data
- `base = 0 → 0` ensures empty dimensions don't inflate scores
- tags are high-intent signals (user-curated) — weight 30 reflects this

## Planned extensions

Future dimensions can be added while keeping total at 100 by rebalancing weights.

Candidates:

- recency overlap (recently played tracks)
- same labels / years / countries (from metadata)
- diversity/novelty balance
