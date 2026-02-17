---
name: update-changelog
description: Update the CHANGELOG.md file based on recent git changes
disable-model-invocation: false
---

Update the CHANGELOG.md file based on recent git changes.

## Context

Radio4000 (r5) is a web app, not a library. No breaking changes to track. No marketing announcements or sales pitches. Track primarily relevant user-facing changes.

## Style

Narrative threads, not commit logs. Changelogs translate the chaos of development into coherent progress.

A flat list of `- #Domain` bullet points. No sub-headers, no "Improvements"/"Fixes" sections, no intro paragraphs.

Tag by domain with `#Domain` prefixes—product areas, not change types.

Domains: `#Player`, `#Channels`, `#Search`, `#Auth`, `#Map`, `#Queue`, `#Broadcast`, `#UI`, `#i18n`. Performance or internal changes get noted in the description, not as tags (e.g., "#Player Lazy-loaded Leaflet to reduce bundle size").

Past tense, active voice. "Added dark mode" not "Dark mode has been added."

## What belongs

User-facing changes. Meaningful dev improvements. Frustration-killing patches. If it doesn't affect someone using or building on the software, skip it.

Find the minimum text that communicates clearly. "Fixed crash on startup" often says everything. Expand only when context helps.

Describe features as they are now, not how we got there. "Multi-deck player with independent queues and controls" — not "Fixed jitter, rewrote polling, migrated schema." The journey is in the commits; the changelog is the destination.

One sentence per entry. No sub-clauses about internals, schemas, or implementation choices. If an entry needs a dash and a follow-up explanation, it's too detailed.

New features absorb their bug fixes. If a feature was built and fixed in the same cycle, the changelog just shows the working feature.

## Format

Monthly headers: `## January 2026`. No dated entries.

## Process

1. Read the existing CHANGELOG.md first — note what's already there
2. Check jj log to find commits since the last changelog update
3. Identify user-facing and meaningful changes not yet in the changelog
4. **Prepend** new entries at the top of the current month's section (right after the `## Month Year` header). Never delete, rewrite, or reorganize existing entries.
5. Tag by product domain (e.g., #Player, #Channels, #Auth)
