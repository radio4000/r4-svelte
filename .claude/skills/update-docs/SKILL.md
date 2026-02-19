---
name: update-docs
description: Update docs/ files to reflect current code
disable-model-invocation: false
---

Update `docs/` files to match current code. These docs are for anyone working on the codebase — human or otherwise.

## Style

Follow [docs/tone.md](../../docs/tone.md) for voice and `docs/code-style.md` for formatting. No corporate headings ("Integration Points", "Key Takeaways", "Summary"). No preamble paragraphs. Prefer flowing prose over bullet lists — bullets are for file/function references, not for restating things that read fine as sentences.

Describe what the code does now, not how we got there. Skip exhaustive API docs (that's `overview.json`), unbuilt features, and info already in code comments. Cross-reference related docs with relative links: `[views.md](views.md)`.

## Process

1. Read the existing doc first — don't rewrite what's fine
2. Read the source files the doc covers — grep for key exports, check imports
3. Update or add sections for things that changed or are missing
4. Remove stale info that no longer matches the code
5. Keep existing structure unless it's actively misleading
6. Don't bloat — if a section is already clear and correct, leave it alone
