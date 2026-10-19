# Performance

Make it measurable first, then faster. The test channel is `/oskar` (~2.6k tracks).

## Bench

Two speeds. Explore on dev (`portless r4 bun run dev`, then `https://r4.localhost/oskar/tracks?perf`): edit, let HMR reload, read `window.r5.perf()`. Seconds, no build. `bun perf/throttle.ts` throttles the CPU of every page in an agent-browser session for as long as it runs. Dev numbers are inflated, but which component is hot holds. Then prove the change on a build with `--ab`.

```
bun run bench                        # full journey once (~45s); builds and serves itself if :4173 is down
bun run bench --ab main --only load:home,home→channel,channel→tracks   # prove a change: ~2 min
bun run bench --trace channel→tracks # run up to that step, trace it, explain where the time went
bun run bench --url https://radio4000.com   # against prod
```

`perf/bench.ts` replays daily use as a fresh visitor at 4x CPU: home, a channel, all its tracks, scroll, a #tag and @mention, search, play from a track card, next/prev/shuffle, explore in each view, play from a channel card, filter, search channels, back to tracks, full channel load. With `R4_ROBOT_EMAIL`/`R4_ROBOT_PASSWORD` in `.env.local` (from AGENTS.local.md) it then signs in as the robot and adds, edits and deletes a track on `/robot-afterhours`.

Steps run in order, so `--only` must include the steps your step depends on. Gaps are allowed: `--only load:home,home→channel,channel→tracks,play:track-card` plays from the unfiltered list because search is left out. A step whose button isn't on screen is skipped. A run that fails is retried once. Never bench dev.

Proving a change: `--ab <rev>` builds that revision next to your working copy and alternates runs, 3 each. It prints median (min–max) and marks a change "noise" when the ranges overlap. Use `--only` up to your step (~2 min); the full journey takes ~15 min, so run it once at the end. Deltas against an old `baseline.json` are hints, not results: the same code swings 30% when anything else uses the CPU.

Read `blocking` and `worst frame` first: they're main-thread cost. `ms` includes Supabase round trips, so for render work trust it only on big deltas. Spans are wall time, waits included: a long `livequery:ready` is usually the network. Scroll is only slow on the first pass after navigating; a warm second pass hides the problem, which is what `scroll:tracks` measures.

`--trace` saves a DevTools trace (path printed at the end) and explains the step, mapped to source file and line: hottest functions by self time, app code (`src/`) by inclusive time overall and per long task, library and native time (DOM inserts, svelte) charged to the app frame that caused it, and main-thread phases (style, layout, paint, intersection observers) the JS profile can't see. `--top 30` shows more lines. Source names need the bench's own build, which has sourcemaps. agent-browser's `profiler` and `trace` don't help here: one records whatever iframe is playing, the other has no CPU samples.

Before benching, close dev servers and other browsers; they inflate traces by 20% or more, and the bench warns when the machine is busy. Only one bench runs at a time across the machine.

Agents: start the bench in the background and wait for its last line, `saved …`. Never use `pgrep -f bench` or `pkill -f "vite preview"`: both match your own shell, so one never ends and the other kills it.

Each run saves JSON and a markdown table to `perf/results/` (gitignored; compare on the same machine).

Columns: `ms` runs from action until the page goes quiet (no fetch, mutation or long frame for 500ms). `blocking` is long-animation-frame blocking time, `worst frame` the longest frame. Then data requests, images, DOM nodes, heap and the top spans.

## In use

Daily use is the real benchmark. Open any page with `?perf` (dev, preview or prod) and measuring stays on in that browser until `?perf=0`; off, it costs nothing. With it on, `src/lib/perf.ts` catches every click or keypress that takes over 200ms, with no code at call sites: what was touched, the route, and what kept the main thread busy. `window.r5.perf().slow` lists the last 50. Nothing leaves the tab.

Agents: `agent-browser open <url>?perf`, use the app with real clicks, then `eval "JSON.stringify(window.r5.perf().slow)"`. The bench does this itself and prints the slow taps under its table.

`span('area:what')` names a stretch of work for slow taps and DevTools traces. There are two: `nav` (root layout) and `livequery:copy`/`:ready` (useLiveQuery.svelte.ts). Add one only where a slow interaction keeps pointing without a name. Never read `$state` inside a span in an effect: the effect will track it and loop.

## Known

`/[slug]/tracks` renders every track at once (48k DOM nodes) and freezes for about 4s each time, which also slows playing from it. Explore's map view takes about 3s, and the heap grows to about 250MB over one journey. Older findings: `perf/perf-report.html`.
