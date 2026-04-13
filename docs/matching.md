# Channel matching score (0-100)

This score is shown for signed-in users on channel pages, next to the follow/favorite button.

Goal: provide a transparent overlap score between **your main channel** and the viewed channel.

## Formula

`score = url_match + artist_title_match`

- `url_match = url_coverage * 60`
- `artist_title_match = artist_title_coverage * 40`
- `total = round(url_match + artist_title_match)`
- final score is clamped to `0..100`

Weights are defined in code:

- `url`: `60`
- `artistTitle`: `40`

File: `src/lib/channel-match-score.ts`

## Inputs

For both channels we build unique sets:

1. URL key set
- Uses `provider:media_id` when available (or parsed from URL via `media-now`).
- Falls back to normalized URL string.

2. Artist+Title key set
- Parses track title with the pattern `Artist - Title`.
- Normalizes to lowercase ASCII-ish tokens (diacritics removed, punctuation stripped).
- Tracks without a parsable `Artist - Title` are ignored for this part.

## Coverage overlap (directional)

For each set:

- `overlap = intersection(A, B)`
- `base = size(B)` where `B` is the viewed channel set
- `ratio = overlap / base`
- if `base = 0`, ratio is `1` (neutral, not a penalty)

Direction matters:

- `A = your channel keys`
- `B = viewed channel keys`

This means if all keys from the viewed channel exist in your channel, coverage is 100% for that part.

Examples:

- Same channel vs itself: `100%`
- Viewed channel is a strict subset of yours: `100%`
- You are a subset of viewed channel: `< 100%`

## Why this model

- deterministic
- explainable
- cheap to compute client-side
- easy to evolve

## Planned extensions

To keep compatibility, future dimensions can be added as new weighted parts while keeping total at 100.

Possible additions:

- tag overlap
- same labels / years / countries (from metadata)
- recency overlap (what both channels played recently)
- diversity/novelty balance (not only duplicates)

When adding a new part:

1. define its extraction method
2. define its overlap ratio
3. rebalance weights so total remains exactly 100
4. document it here before release
