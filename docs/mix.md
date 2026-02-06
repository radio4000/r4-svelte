# Mix

YouTube DJ mixer. N decks with dynamic add/remove, crossfader for 2-deck mode.

## Signal flow

```
┌─────────┐    ┌───────────┐    ┌──────────────┐    ┌──────────────────┐
│  Crate  │ →  │ Processor │ →  │ Load A/B/C…  │ →  │  Decks A/B/C…    │
└─────────┘    └───────────┘    └──────────────┘    └────────┬─────────┘
                                                             │
                                                   (2 decks only)
                                                    ┌────────┴─────────┐
                                                    │    Crossfader    │
                                                    └──────────────────┘
```

**Crate** picks sources (channels, tags). Combines and filters tracks from those sources.

**Processor** applies shuffle, error filtering, limits count. Stateless transforms.

**Load A/B/C…** pushes the processed track list into a deck's queue. One loader per deck.

**Decks** play YouTube videos with transport (prev/play/next), volume, speed. Each deck has its own queue and volume fader. Decks use numeric IDs internally, display labels A–Z.

**Crossfader** (2 decks only) blends deck volumes via equal-power curve. Hidden when >2 decks — each deck's own volume fader serves as its channel fader.

## Multi-deck

- Add/remove decks dynamically (1–8)
- Deck colors cycle through a 6-color palette (red, blue, green, purple, orange, teal)
- CSS grid auto-tiles: 1 deck = full width, 2 = side-by-side, 3+ = wraps intelligently
- Pipes and loaders adapt to deck count

## Hardware metaphor

Think modular gear on a table. Each section is a device you could unplug and swap. Crate = record box. Processor = effects unit. Decks = turntables. Crossfader = DJ mixer channel fader.

The visual uses "pipes" connecting devices to reinforce the signal-flow mental model.
