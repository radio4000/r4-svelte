# Dialogs

Native HTML `<dialog>` and `popover` APIs. No third-party libraries.

## Dialog component

`src/lib/components/dialog.svelte` — reusable modal wrapper.

```svelte
<script>
	import Dialog from '$lib/components/dialog.svelte'
	let showModal = $state(false)
</script>

<button onclick={() => (showModal = true)}>Open</button>

<Dialog bind:showModal>
	{#snippet header()}
		<h2>Title</h2>
	{/snippet}
	Content here
</Dialog>
```

**Props:**

- `showModal` (bindable) — controls open/close state
- `header` (snippet) — title area, close button added automatically
- `children` (snippet) — dialog content

**Behavior:**

- Opens with `dialog.showModal()` (blocks background, traps focus)
- Closes on: backdrop click, Escape key, close button
- Animates in with scale + opacity transition
- Max width 640px, centered

## Opening dialogs from anywhere

Use `appState` flags to trigger dialogs from any component:

```js
// From anywhere in the app
appState.modal_track_add = {url: 'https://...'}
appState.modal_track_edit = {track}
appState.modal_share = {track, channel}
```

The dialog component watches with `$effect`, opens, then clears the flag:

```js
$effect(() => {
	if (appState.modal_track_add) {
		open(appState.modal_track_add)
		appState.modal_track_add = null
	}
})
```

## Current dialogs

| Component                  | Trigger                   | appState key       |
| -------------------------- | ------------------------- | ------------------ |
| `track-add-dialog.svelte`  | keyboard `c`, button      | `modal_track_add`  |
| `track-edit-dialog.svelte` | edit button in track menu | `modal_track_edit` |
| `share-dialog.svelte`      | share button              | `modal_share`      |
| `queue-panel.svelte`       | clear history button      | (local state)      |

## Popover menus

`src/lib/components/popover-menu.svelte` — dropdown menus using native popover API.

```svelte
<PopoverMenu id="my-menu">
	{#snippet trigger()}
		<Icon icon="more" />
	{/snippet}
	<button>Option 1</button>
	<button>Option 2</button>
</PopoverMenu>
```

**Props:**

- `id` (required) — unique ID for popover targeting
- `trigger` (snippet) — button content
- `closeOnClick` — auto-close when clicking buttons/links (default: true)
- `onclose` — callback when popover closes

**Features:**

- Native `popover="auto"` — closes on outside click, Escape key
- Auto-positions below trigger button
- Edge detection keeps menu in viewport
- Add `data-no-close` to buttons that shouldn't auto-close the menu

## Inline dialogs

For lightweight cases without the Dialog wrapper, use `<dialog open>` directly with conditional rendering. See `batch-action-bar.svelte` for examples.
