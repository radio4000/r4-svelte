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

Lead with motivation when it matters—a paragraph on why this release exists. Not every release needs this.

Group items into two buckets: **improvements** (makes the product better) and **fixes** (repairs something broken). Tag by domain with `#Domain` prefixes—product areas, not change types.

Domains: `#Player`, `#Channels`, `#Search`, `#Auth`, `#Map`, `#Queue`, `#Broadcast`, `#UI`, `#i18n`. Performance or internal changes get noted in the description, not as tags (e.g., "#Player Lazy-loaded Leaflet to reduce bundle size").

Past tense, active voice. "Added dark mode" not "Dark mode has been added."

## What belongs

User-facing changes. Meaningful dev improvements. Frustration-killing patches. If it doesn't affect someone using or building on the software, skip it.

Find the minimum text that communicates clearly. "Fixed crash on startup" often says everything. Expand only when context helps.

## Format

Monthly headers: `## January 2026`. No dated entries.

## Process

1. Check jj diff to understand recent changes
2. Identify user-facing and meaningful changes
3. Write concise, specific entries grouped by improvements/fixes
4. Tag by product domain (e.g., #Player, #Channels, #Auth)
