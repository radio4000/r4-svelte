---
name: version-control
description: Detect VCS (git or jj), log recent changes, describe any missing descriptions.
disable-model-invocation: true
allowed-tools: Bash
---

Follow [docs/tone.md](../../docs/tone.md) for voice.

## Process

1. Detect VCS — `jj root` succeeds → jj, else git
2. Log recent changes (`jj log --limit 20` / `git log --oneline -20`)
3. Find changes with empty or default descriptions (jj: "(no description set)")
4. For each: show the diff, draft a one-liner, ask before applying
5. If a change touches multiple unrelated concerns, offer to split into focused changes

## jj

No staging area. File edits continuously update the current change (`@`). `jj describe` labels it. `jj new` closes it and starts a fresh one.

Split by concern (not by file type): `jj commit <files> -m "msg"` commits specific files from `@` into a new parent, rest stays in `@`. Repeat per group. (`jj split <files>` is similar but keeps bookmarks on the remainder.)

## Descriptions

Imperative, no trailing period. Be specific — name the thing and what happened: "Fix channel-card a11y (role + aria-label)", not "Tweak channel-card". Skip formatting-only changes.
