---
title: Getting started
description: What DbLocal is, how to open your first database and where to go next.
category: Getting started
order: 0
related: [connections, relationships]
---

# Getting started

DbLocal is a database browser that runs on your machine. It reads **Postgres**, **MySQL** and **SQLite**, shows every foreign key as something you can click, and keeps your data where it is: nothing leaves your computer.

## Open a database

1. On the home page, click **New connection** and fill in the host, or paste a connection string.
2. Click **Test connection**, then **Save**.
3. Open the connection and pick a schema. The tables appear in the sidebar.

> [!TIP]
> Want to look around first? Use **Try the demo database** on the home page. It is a small shop (users, orders, products) that you can edit freely and reset at any time.

## Follow the relations

Open a table and look for the chips in foreign key columns and the count columns at the end of the grid. Click a chip to open the related record, or a count to open the related rows. The trail at the top shows where you came from.

## Change data safely

Edits are held as pending changes until you save them. **Preview SQL** shows exactly what will run, and a failed save changes nothing.

## Find your way

- Press <kbd>F1</kbd> or click **?** in the top bar to open this help from anywhere.
- Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> on macOS) for the command palette.
- Press <kbd>?</kbd> for the keyboard shortcuts.

## Where to next

- [Connections](connections) covers SSL, SSH tunnels, environments and read-only.
- [Navigating relationships](relationships) explains chips, counts and the record panel.
- [SQL editor](sql-editor) is for queries that go beyond the grid.
