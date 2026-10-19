---
title: Editing data
description: Change cells, add and delete rows, review the SQL and save everything in one transaction.
category: Data
order: 4
related: [data-grid, relationships]
---

# Editing data

Edits are never written one by one. Every change waits as a *pending change* until you press **Save**, and then all of them are applied in a single transaction: if one statement fails, nothing is written.

## What can be edited

Tables that have a primary key, or a unique index whose columns are all `NOT NULL`, are editable. Views and tables without such a key are read-only, and the grid says why. A connection marked read-only (or a DbLocal started with `DBLOCAL_READONLY=1`) hides every editing control, and the server refuses writes with `403`. Generated and auto-increment columns cannot be typed into.

## Editing a cell

Double-click a cell, or select it and press **Enter** or **F2**. The editor follows the column type: text, number, date and time pickers, a select for enums, a toggle for booleans (click through *true*, *false* and *NULL*). JSON and array values open in a dialog that checks the syntax as you type. **Enter** confirms and moves down, **Tab** confirms and moves right, **Esc** cancels. Invalid input, such as text in a number column, is refused with a message and nothing is changed.

Right-click a cell to **Set NULL** or **Set DEFAULT**, to undo that cell or the whole row, to duplicate or to delete the row. A foreign key cell opens a picker that searches the related table by its display column, with a preview of the record.

A changed cell is tinted, and hovering it shows the value it had before. Setting a cell back to its original value removes the change.

## Adding and deleting rows

**Add record** puts a new row at the top of the grid. Columns you leave alone take their database default, shown as `DEFAULT`. From a record panel, **Create** on a *Has many* relation opens the child table with a new row whose foreign key already points at the record.

The checkbox in the left column ticks a row; the one in the header ticks every loaded row. A bar shows how many are ticked, with **Delete selected** (same impact check as above) and **Clear**. The row number still opens the record.

Pressing **Delete** (or *Delete row*) on selected rows first shows what depends on them: the one-to-many relations that point at the rows, how many records each has, and what the foreign key does (`CASCADE` removes them too, `RESTRICT` blocks the delete). The rows are then struck through until you save.

## Saving {#saving}

The bar at the bottom of the grid shows **N pending changes**. **Preview SQL** shows the statements that will run; values go to the database as parameters and are shown inline only so you can read them. **Save** (or **Ctrl/⌘+S**) applies the batch. When the batch deletes rows (on any connection), or on a `prod` connection, a dialog says how many rows go away and asks you to type the connection's name first.

If the database rejects something, such as a duplicate key, the row that caused it is outlined in red with the database's message, and every pending change is kept so you can fix it and save again. **Discard** drops all pending changes. Closing a tab that has pending changes asks first.

## Importing a file {#import}

**Import** (behind the `«` toggle on the right of the toolbar, next to Export) reads a CSV or JSON file into the table. CSV needs a header row; the delimiter (comma, semicolon, tab or pipe) is detected and can be changed. JSON is an array of objects, or one object per line, as DbLocal exports it.

File columns are matched to table columns by name (case, spaces, `_` and `-` ignored); change any match or set it to *Do not import*. Computed and binary columns cannot be filled; identity and auto-increment columns can, so the file keeps its ids. Every cell is checked like a value typed in the grid: numbers, dates (`YYYY-MM-DD`), booleans (`true`/`false`, `1`/`0`, `yes`/`no`), JSON and UUIDs. Text such as `now()` is stored as written. With **Empty cells are NULL**, an empty cell is NULL, or the column default when the column is NOT NULL and has one.

- **Insert new rows** adds every record. A key that already exists fails.
- **Insert or update** uses the table's key (the primary key, or a unique NOT NULL index): a record whose key exists updates that row, the others are inserted. The key columns must be mapped. On MySQL any unique index that matches also counts as an existing row. Since it overwrites rows, upsert shows a warning and asks for the connection's name before it runs.

Invalid records are listed before anything runs; fix the file, or tick **Skip invalid records**. Then the records are sent in batches of 1000: all batches are checked by the server first, and nothing is written if one fails. Each batch is then written in its own transaction, so a failure while writing (a duplicate key, a foreign key) keeps the batches already written and says how many. On a `prod` connection you type the connection's name first; a read-only connection offers no import.

> [!NOTE]
> On Postgres, importing ids into a `serial` or identity column does not move its sequence. Run `SELECT setval(pg_get_serial_sequence('table', 'id'), max(id)) FROM table` afterwards, or new rows will collide with the imported ones.
