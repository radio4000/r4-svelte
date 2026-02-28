# Localization

- Translations live in `i18n/messages/<languageTag>.json`
- English (`en`) is the source of truth; all other languages fall back to `en` for missing keys
- Supported locales are listed in `i18n/project.inlang/settings.json` (`languageTags`)

## Adding strings

1. Add new keys to `i18n/messages/en.json` (sorted alphabetically)
2. Use them in components: `import * as m from '$lib/paraglide/messages'` then `m.your_key()`
3. Run `bun run i18n` — removes orphaned keys from all languages and recompiles Paraglide

Do **not** add the new keys manually to other language files — they stay absent until translated, and Paraglide falls back to English in the meantime.

## Translating

To see what is untranslated across all languages:

```bash
bun run i18n:extract
# prints summary to stderr: "Total untranslated keys: N"
```

To generate a batch file for translation:

```bash
bun run i18n:extract -- i18n/batches/2026-03.json
```

This writes a JSON with every key/locale pair whose value still matches English. Give it to a translator or an LLM — keep all `{placeholders}` unchanged.

To apply a completed batch:

```bash
bun run i18n:apply -- i18n/batches/2026-03.json
bun run i18n   # recompile
```

`apply-batch.js` validates that all `{placeholders}` are preserved and rejects unknown keys.

## Adding a new language

```bash
# 1. Copy the English baseline
cp i18n/messages/en.json i18n/messages/dk.json

# 2. Add "dk" to languageTags in i18n/project.inlang/settings.json

# 3. Compile
bun run i18n
```

The new locale appears in the language switcher immediately. Translate `messages/dk.json` at your own pace — untranslated keys fall back to English.

## Notes

- RTL locales (e.g. `ar`, `ur`) are automatically rendered right-to-left via `dir="rtl"` on `<html>`
- On boot, the app matches `navigator.languages` and falls back to the Paraglide default (`en`)
- Routes under `src/routes/_debug` are developer playgrounds and do not need translation
- Also see [Fink](https://fink.inlang.com) for a web UI to edit translations
