# Keyboard shortcuts

Press `?` to open the shortcuts help dialog showing all available shortcuts.

Default bindings and available actions are defined in `$lib/keyboard.js`. Visit /settings/keyboard to customize. Config is stored in appState.

Default bindings: `/` search, `k` play/pause, `s` shuffle, `r` compact deck, `g h` home, `g s` settings, `?` shortcuts help.

The keyboard events are attached through `<KeyboardShortcuts>` in layout.svelte. The help dialog is `<ShortcutsDialog>` in layout-header.svelte.

## Tracklist navigation

Arrow keys navigate tracklists — up/down to move between tracks, enter/space to play the selected track.
