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

The bar at the bottom of the grid shows **N pending changes**. **Preview SQL** shows the statements that will run; values go to the database as parameters and are shown inline only so you can read them. **Save** (or **Ctrl/⌘+S**) applies the batch. On a `prod` connection you are asked to type the connection's name first.

If the database rejects something, such as a duplicate key, the row that caused it is outlined in red with the database's message, and every pending change is kept so you can fix it and save again. **Discard** drops all pending changes. Closing a tab that has pending changes asks first.
