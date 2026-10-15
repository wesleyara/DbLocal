---
title: Command palette, shortcuts and search
description: Reach anything from the keyboard, see every shortcut, and find a value in any table.
category: Productivity
order: 8
related: [data-grid, sql-editor]
---

# Command palette, shortcuts and search

## Command palette

Press **⌘/Ctrl+K** (or click the search field in the top bar) and type.

- Tables, saved queries, other connections, recent tabs and actions are searched together; typing is fuzzy, so `ordit` finds `order_items`.
- `>` limits the list to **actions**: new query, open the diagram, refresh the schema, switch theme or language, sign out.
- `#users 42` goes straight to **record 42 of `users`**. Type `#users` first to pick the table, then the primary key. Tables with a composite key open the table instead.
- Recent tabs come first while the field is empty. Arrow keys move, **Enter** opens, **Esc** closes.

## Keyboard shortcuts

Press **?** anywhere (outside a field) to open the cheat sheet. It lists every shortcut by context, with ⌘ on macOS and Ctrl elsewhere. Shortcuts do not fire while you type in a field or the editor, except **⌘/Ctrl+K**, **⌘/Ctrl+S**, **⌘/Ctrl+Enter** and **⌘/Ctrl+Shift+F**.

| Context | Keys |
| --- | --- |
| Everywhere | **⌘K** palette, **⌘⇧F** search data, **?** cheat sheet, **⌘S** save |
| Tabs | **⌘[** / **⌘]** history, **⌘⇧[** / **⌘⇧]** previous / next tab, **⌘T** new query, **⌘W** close, **⌘B** sidebar, **⌘R** reload data |
| Grid | arrows, **Home/End**, **PgUp/PgDn**, **Enter** edit, **Space** open record, **⌘C** copy, **Del** mark for deletion, **⌘Z** undo the row's pending edits, **F** filter by the cell |

## Searching the data

**⌘/Ctrl+Shift+F** (or *Search data in schema* in the palette) looks for a value in every table of the current schema.

- **Contains** is a case-insensitive substring over text columns; **Exact** compares whole values, including enum, uuid and numeric columns.
- Numbers are only compared with numeric terms, and uuid columns only with a full uuid.
- The search runs on demand, four tables at a time, and keeps at most 10 rows per table. Results appear as each table answers.
- **Cancel** (or closing the dialog) stops the tables that have not started.
- Click a row to open the record, or **Open table filtered** to see all matches in the grid.
