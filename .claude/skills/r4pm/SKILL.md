---
name: r4pm
description: 'Project upkeep: version control, changelog, docs. Run with a subcommand (vcs, changelog, docs) or no args to run all three.'
---

Radio4000 project manager. Run with a subcommand or no args for the full sweep.

- `/r4pm` — all three in order: vcs → changelog → docs
- `/r4pm vcs` — describe and split uncommitted changes
- `/r4pm changelog` — update CHANGELOG.md from recent changes
- `/r4pm docs` — update docs/ to match current code

Follow [docs/tone.md](../../docs/tone.md) for voice in all output.

---

## vcs

Describe and organize uncommitted changes.

1. Detect VCS — `jj root` succeeds → jj, else git
2. Log recent changes (`jj log --limit 20` / `git log --oneline -20`)
3. Find changes with empty or default descriptions (jj: "(no description set)")
4. For each: show the diff, draft a one-liner, ask before applying
5. If a change touches multiple unrelated concerns, offer to split into focused changes

### jj

No staging area. File edits continuously update the current change (`@`). `jj describe` labels it. `jj new` closes it and starts a fresh one.

Split by concern (not by file type): `jj commit <files> -m "msg"` commits specific files from `@` into a new parent, rest stays in `@`. Repeat per group. (`jj split <files>` is similar but keeps bookmarks on the remainder.)

### Descriptions

Imperative, no trailing period. Be specific — name the thing and what happened: "Fix channel-card a11y (role + aria-label)", not "Tweak channel-card". Skip formatting-only changes.

---

## changelog

Update CHANGELOG.md based on recent changes.

### Context

Radio4000 (r5) is a web app, not a library. No breaking changes to track. No marketing announcements or sales pitches. Track primarily relevant user-facing changes.

### Style

Narrative threads, not commit logs. Changelogs translate the chaos of development into coherent progress.

A flat list of `- #Domain` bullet points. No sub-headers, no "Improvements"/"Fixes" sections, no intro paragraphs.

Tag by domain with `#Domain` prefixes—product areas, not change types.

Domains: `#Player`, `#Channels`, `#Search`, `#Auth`, `#Map`, `#Queue`, `#Broadcast`, `#UI`, `#i18n`. Performance or internal changes get noted in the description, not as tags (e.g., "#Player Lazy-loaded Leaflet to reduce bundle size").

Past tense, active voice. "Added dark mode" not "Dark mode has been added."

### What belongs

User-facing changes. Meaningful dev improvements. Frustration-killing patches. If it doesn't affect someone using or building on the software, skip it.

Find the minimum text that communicates clearly. "Fixed crash on startup" often says everything. Expand only when context helps.

Describe features as they are now, not how we got there. "Multi-deck player with independent queues and controls" — not "Fixed jitter, rewrote polling, migrated schema." The journey is in the commits; the changelog is the destination.

One sentence per entry. No sub-clauses about internals, schemas, or implementation choices. If an entry needs a dash and a follow-up explanation, it's too detailed.

New features absorb their bug fixes. If a feature was built and fixed in the same cycle, the changelog just shows the working feature.

### Format

Monthly headers: `## January 2026`. No dated entries.

### Process

1. Read the existing CHANGELOG.md first — note what's already there
2. Check jj log to find commits since the last changelog update
3. Identify user-facing and meaningful changes not yet in the changelog
4. **Prepend** new entries at the top of the current month's section (right after the `## Month Year` header). Never delete, rewrite, or reorganize existing entries.
5. Tag by product domain (e.g., #Player, #Channels, #Auth)

---

## docs

Update `docs/` files to match current code. These docs are for anyone working on the codebase — human or otherwise.

### Style

Follow `docs/code-style.md` for formatting. No corporate headings ("Integration Points", "Key Takeaways", "Summary"). No preamble paragraphs. Prefer flowing prose over bullet lists — bullets are for file/function references, not for restating things that read fine as sentences.

Describe what the code does now, not how we got there. Skip exhaustive API docs (that's `reference.json`), unbuilt features, and info already in code comments. Cross-reference related docs with relative links: `[views.md](views.md)`.

### Process

1. Read the existing doc first — don't rewrite what's fine
2. Read the source files the doc covers — grep for key exports, check imports
3. Update or add sections for things that changed or are missing
4. Remove stale info that no longer matches the code
5. Keep existing structure unless it's actively misleading
6. Don't bloat — if a section is already clear and correct, leave it alone
