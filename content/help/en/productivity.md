---
title: Command palette
description: Reach tables, queries, records and actions from one search field.
category: Productivity
order: 8
related: [keyboard-shortcuts, global-search, sql-editor]
---

# Command palette

![The command palette](/help/shots/palette-{theme}.png)

## Command palette

Press **⌘/Ctrl+K** (or click the search field in the top bar) and type.

- Tables, saved queries, other connections, recent tabs and actions are searched together; typing is fuzzy, so `ordit` finds `order_items`.
- `>` limits the list to **actions**: new query, open the diagram, refresh the schema, switch theme or language, sign out.
- `#users 42` goes straight to **record 42 of `users`**. Type `#users` first to pick the table, then the primary key. Tables with a composite key open the table instead.
- Recent tabs come first while the field is empty. Arrow keys move, **Enter** opens, **Esc** closes.
