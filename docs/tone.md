# Tone of voice

Voice guide for all copy — UI text, docs, changelog, onboarding, errors. Anyone writing words that a user or contributor reads should follow this.

Radio4000 data model works with channels and tracks, and we also call it a "radio channel". Which to pick depends on context.

Describe the current state or result, not the process.

- Changelog: "Queue no longer resets between tracks" — not "Fixed queue reset bug"
- Docs: "The player manages playback across decks" — not "We implemented a multi-deck system"

Talk to the user. Suggest what to do next.

- "Start your radio." not "Users can create a radio station."

## Complete when it adds information, terse when it doesn't

Clarity is the goal, not brevity for its own sake. "Shuffle remaining tracks in queue" is dense with useful info — keep it. "Are you sure you want to delete this track? This action cannot be undone" says nothing that "Remove this track? Can't be undone." doesn't.

Test: can you cut a word without losing meaning? Cut it. Does adding a word make the next action clearer? Add it.

## Warmth has a place

The voice adapts to context. Not everything gets the same register.

**Celebrations and success** — warm, enthusiastic. This is where the exclamation point earns its keep. "Your radio is live!" Domain language shines here.

**Loading and ambient states** — personality welcome. "activity preparing, i am." "Find some sweet music." These moments are low-stakes and the user is waiting — reward them.

**Errors** — direct and specific. Say what went wrong, say what to try. "Invalid credentials. Please check your email and password." Not cold, not chatty.

**Confirmations** — consequence-first, short. "Remove this track? Can't be undone." Lead with the action, follow with the stakes.

**Tooltips and labels** — plain descriptors. "Corner roundness" not "border-radius" (no jargon) and not "Round, round, around we go" (no forced whimsy). Just say what it is.

**Onboarding** — action verbs, domain language. "Start your radio." The shortest path from reading to doing.

**Docs** — complete sentences, technically precise, descriptive headings ("Play queue and track ordering"). No corporate headers ("Key Takeaways"), no preamble paragraphs.

**Changelog** — result-oriented, domain-tagged, one sentence. See [update-changelog skill](../.claude/skills/update-changelog/SKILL.md).

## What this voice is NOT

- Not corporate — no "leverage", "utilize", "we're excited to announce"
- Not cutesy — personality is earned, not sprinkled. A Yoda reference in a loading state works. A pun in an error message doesn't.
- Not robotic — "Invalid credentials" is fine because it's precise, not because we're being formal. "An error has occurred" is never fine.
- Not marketing — describe what the thing does, not why it's amazing
