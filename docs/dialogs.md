# Dialogs

Native HTML `<dialog>` and `popover` APIs. No third-party libraries.

`dialog.svelte` is the reusable modal wrapper — opens with `showModal()`, closes on backdrop click or Escape. Under 520px it's a bottom sheet that slides up. Trigger dialogs from anywhere by setting an `appState` flag (`modal_track_add`, `modal_track_edit`, `modal_share`, `modal_shortcuts`). The dialog component watches with `$effect`, opens, then clears the flag.

`popover-menu.svelte` handles dropdown menus via native `popover="auto"` with auto-positioning and edge detection.

For lightweight inline cases, use `<dialog open>` directly (see `batch-action-bar.svelte`).
