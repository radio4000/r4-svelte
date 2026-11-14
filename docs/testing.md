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

`bun run types` checks the transpiled Svelte files it leaves in `.svelte-kit/.svelte-check/` and never deletes old ones, so a renamed or removed component can report errors that no longer exist or hide real ones; when the count looks wrong, `rm -rf .svelte-kit/.svelte-check` and run it again.
