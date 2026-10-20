# Testing

Pick the target that matches the question.

| Target  | Start                              | URL                   | Use for                                         |
| ------- | ---------------------------------- | --------------------- | ----------------------------------------------- |
| dev     | `portless r4 bun run dev`          | https://r4.localhost  | behaviour, UI, HMR. Unbundled: never for perf   |
| preview | `bun run build && bun run preview` | http://localhost:4173 | perf, service worker, anything build-dependent  |
| prod    | —                                  | https://radio4000.com | "was it already like this?" before blaming a PR |

Preview serves the last build: stop it, rebuild, restart (rebuilding under a running preview crashes it). `bun run bench --build` does all three for perf.

- In a browser: [browser-testing](browser-testing.md)
- Speed: [performance](performance.md)

`bun run test` is timing-sensitive: under CPU load (a bench, a build) a few tests can fail. Rerun on a quiet machine before chasing them.
