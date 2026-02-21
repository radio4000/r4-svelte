# Custom Menus

Everything is a view. A pin in the sidebar is a reference to a saved view. A single-channel view navigates to `/{slug}`. A filtered view navigates to `/search?...`. No separate "pin types" — just views.

Users pick which saved views appear in the header. The header has fixed items (Home, Search, Broadcasts, Settings) and a user-controlled section of pinned views between them.

Depends on saved views (`plan-saved-views.md`). This is a follow-up, not part of the first implementation.

## Three layers

- **View** — runtime query params `{channels, tags, order, ...}`
- **SavedView** — a named View `{id, name, params, ...}`
- **Pin** — a SavedView placed in a menu `{id, view_id, position}`

A Pin is just a reference + ordering. No data duplication. `position` controls order in the menu.

## Data

```ts
interface Pin {
	id: string
	view_id: string // references SavedView.id
	position: number // ordering weight
}
```

localStorage collection (`pinsCollection`), same pattern as the others.

## Cascade delete

Deleting a SavedView also removes any pin referencing it. `deleteView(id)` handles both — one function, clean.

## Open questions

- Max pins? Or just scroll/overflow.
- Auto-pin user's own channel on first use?
- Could fixed nav items (Home, Search, Broadcasts) also become views eventually? Maximum malleability but more complexity.
- Mobile: overflow menu vs horizontal scroll.
