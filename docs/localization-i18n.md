# Localization

- Translations live in `./i18n/messages/<languageTag>.json`
- English (`en`) is the canonical source; copy it to bootstrap a new locale.
- The list of supported locales is defined once in `project.inlang/settings.json` (`languageTags`). Update that array when adding a language (e.g. add `"dk"`), create `messages/dk.json` by copying `messages/en.json`, translate the values, then recompile Paraglide.

## Keeping translations in sync

After adding strings to `en.json`, run:

```bash
bun run i18n
```

This syncs all languages with English (adds missing keys using English as placeholder, removes orphaned keys not in English, sorts alphabetically) and recompiles Paraglide. The script lives at `i18n/sync.js` if you're curious.

## Full example, how to add Spanish (`es`)

```bash
# 1. copy the baseline strings
cp i18n/messages/en.json i18n/messages/es.json

# 2. add "es" to languageTags in project.inlang/settings.json

# 3. sync and recompile
bun run i18n
```

Restart `bun run dev` and you should see "es" in the language switcher immediately; keep editing `messages/es.json` with actual translations afterward.

RTL locales (e.g. `ar`) are automatically rendered right-to-left. Set the locale via the language switcher or `appState.language` and the `<html>` element will toggle `dir="rtl"` for those tags. When the app boots with no saved preference it tries to match `navigator.languages` and falls back to the Paraglide default.

Also see [Fink](https://fink.inlang.com) from [inlang](https://inlang.com) for interface to edit the language strings.
