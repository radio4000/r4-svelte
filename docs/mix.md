# Mix

YouTube DJ mixer. Two decks, one crossfader.

## Signal flow

```
┌─────────┐    ┌───────────┐    ┌───────┐    ┌────────────┐
│  Crate  │ →  │ Processor │ →  │ Load  │ →  │   Decks    │
│         │    │           │    │ A / B │    │   A   B    │
└─────────┘    └───────────┘    └───────┘    └─────┬──────┘
                                                   │
                                            ┌──────┴──────┐
                                            │  Crossfader │
                                            └─────────────┘
```

**Crate** picks sources (channels, tags). Combines and filters tracks from those sources.

**Processor** applies shuffle, error filtering, limits count. Stateless transforms.

**Load A/B** pushes the processed track list into a deck's queue.

**Decks** play YouTube videos with transport (prev/play/next), volume, speed. Each deck has its own queue.

**Crossfader** blends deck volumes via equal-power curve. A full-left, B full-right, center is both at ~70%.

## Hardware metaphor

Think modular gear on a table. Each section is a device you could unplug and swap. Crate = record box. Processor = effects unit. Decks = turntables. Crossfader = DJ mixer.

The visual uses "pipes" connecting devices to reinforce the signal-flow mental model.
