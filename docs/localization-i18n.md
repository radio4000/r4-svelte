# Localization

- Translations live in `i18n/messages/<languageTag>.json`
- English (`en`) is the source of truth; all other languages fall back to `en` for missing keys
- Supported locales are listed in `i18n/project.inlang/settings.json` (`languageTags`)

## Adding strings

1. Add new keys to `i18n/messages/en.json` (sorted alphabetically)
2. Use them in components: `import * as m from '$lib/paraglide/messages'` then `m.your_key()`
3. Run `bun run i18n` — removes orphaned keys from all languages and recompiles Paraglide

Do **not** add the new keys manually to other language files — they stay absent until translated, and Paraglide falls back to English in the meantime.

## Audit checklist

When doing an English-source coverage pass, check these user-visible surfaces:

- Route titles in `<svelte:head>`
- Button text, labels, legends, empty states, helper copy, and dialog copy
- `title`, `aria-label`, and `placeholder` attributes
- Shared components reused across pages
- Browser-visible errors that are shown in the UI

Usually out of scope:

- `_debug` routes
- Console logs and internal-only thrown errors
- User content such as channel names, track titles, tags, and URLs

Useful grep for a first pass:

```bash
rg -n '<title>|placeholder=|aria-label=|title=|>[^<{]*[A-Za-z][^<{]*<' src/routes src/lib/components --glob '!src/routes/_debug/**'
```

Review the matches manually. The grep is only for discovery; it will also catch examples, slugs, and non-copy literals.

## Tools

Each script does one thing. Locale argument is always optional and positional.

| Command                         | What it does                                          |
| ------------------------------- | ----------------------------------------------------- |
| `bun run i18n`                  | Sync + recompile Paraglide                            |
| `bun run i18n:stats`            | Per-locale coverage table                             |
| `bun run i18n:stats da`         | Coverage for one locale                               |
| `bun run i18n:extract`          | Missing keys → stdout JSON (all locales)              |
| `bun run i18n:extract da`       | Missing keys → stdout JSON (one locale)               |
| `bun run i18n:check`            | Fail if locale keys/placeholders drift                |
| `bun run i18n:check da`         | Check one locale against English                      |
| `bun run i18n:prune-unused`     | Remove dead keys from `en.json` via `src/` usage scan |
| `bun run i18n:review da`        | Missing keys + review flags → stdout JSON             |
| `bun run i18n:apply batch.json` | Apply a batch file to locale files                    |

All output goes to stdout (pipe to a file if you want one). Stats goes to stdout too — no stderr/stdout mixing.

`i18n:check` is the strict parity guard. It requires every locale to have the same keys as `en.json` and the same `{placeholders}` for every translated string.

`i18n:prune-unused` scans `src/` for the normal `m.key()` pattern, removes unused keys from `en.json`, then `bun run i18n` removes the resulting orphaned keys from the other locales.

## Translating a locale

```bash
# 1. Check coverage
bun run i18n:stats da

# 2. Extract missing keys
bun run i18n:extract da > /tmp/da-batch.json

# 3. Translate the batch (hand to a translator or LLM)
#    Keep all {placeholders} unchanged

# 4. Apply
bun run i18n:apply /tmp/da-batch.json
bun run i18n
```

## Quality review

Missing keys are the easy part. The most valuable fixes are in existing translations: typos (`kanalımm`), formality mixing (`sen` vs `siz` in Turkish), awkward phrasing. No tool catches these automatically.

`i18n:review` runs heuristics on existing translations and flags:

- **Placeholder mismatch** — `{name}` in English but missing or extra in translation
- **Length ratio** — translation <30% or >300% of English length (for strings >10 chars)
- **Identical to another locale** — same value as a different language (possible copy-paste)

```bash
bun run i18n:review da > /tmp/da-review.json
```

The output has two sections: `translations` (missing keys) and `review` (flagged existing translations). Only `translations` is applied by `i18n:apply` — review flags are informational.

These heuristics catch mechanical issues. For typos, tone, and formality drift, read the full locale file alongside `en.json`. The [tone guide](tone.md) applies to translations too.

### Full review workflow

1. Read `i18n/messages/en.json` and the target locale file
2. Run `bun run i18n:review da` for heuristic flags
3. Review the full file for typos, grammar, formality consistency, tone
4. Edit the locale file directly, or put fixes in a batch and apply with `i18n:apply`
5. Run `bun run i18n` to recompile

`i18n:apply` overwrites existing translations — it's not limited to missing keys.

## Batch format

```json
{
	"source_locale": "en",
	"translations": {
		"da": {
			"key_name": "Translated value with {placeholder}"
		}
	}
}
```

`apply-batch.js` validates that all `{placeholders}` match English and rejects unknown keys.

## Adding a new language

```bash
cp i18n/messages/en.json i18n/messages/dk.json
# Add "dk" to languageTags in i18n/project.inlang/settings.json
bun run i18n
```

The new locale appears in the language switcher immediately. Untranslated keys fall back to English.

## Notes

- RTL locales (e.g. `ar`, `ur`) are automatically rendered right-to-left via `dir="rtl"` on `<html>`
- On boot, the app matches `navigator.languages` and falls back to the Paraglide default (`en`)
- Routes under `src/routes/_debug` are developer playgrounds and do not need translation
- Also see [Fink](https://fink.inlang.com) for a web UI to edit translations
