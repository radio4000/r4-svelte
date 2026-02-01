# Keyboard shortcuts

Keyboard shortcuts call functions from $lib/api.js. Default bindings and available actions are in `$lib/keyboard.js`.

Visit /settings which includes <KeyboardEditor> to customize shortcuts. Your config is stored in appState.

```
{
	"r": "toggleQueuePanel",
	"$mod+k": "openSearch"
}
```

The actual keyboard events are attached through <KeyboardShortcuts> in layout.svelte.
