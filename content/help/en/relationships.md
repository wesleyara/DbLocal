---
title: Navigating relationships
description: Follow foreign keys and related records from row to row, with tabs, a trail and links.
category: Data
order: 3
related: [data-grid, schema-browser]
---

# Navigating relationships

DbLocal reads the relations of your schema (foreign keys, junction tables and the virtual relations you declare) and turns them into things you can click.

![The record panel of an order](/help/shots/record-{theme}.png)

## Parents: foreign key chips

A foreign key cell shows the related record as a chip, for example `#42 · Ana Souza`. The text after the dot is the table's display column. Hover the chip for a preview of the record, click it to open the record in the side panel, and **Ctrl/⌘+click** to open it in a new tab. A chip in warning colour is an orphan: the value points at a record that does not exist, which is common with virtual relations.

## Children: relation columns

At the end of the grid, each one-to-many and many-to-many relation has a column with the number of related records, such as `12 orders`. Click it to open the related table filtered to that record. A dashed *relation chip* above the grid, such as `orders of users #42`, tells you the filter came from navigation. Remove it with the **x** to see the whole table again. Hide or show these columns from the **Columns** menu.

Counts are loaded only for the rows on screen, in one request per relation, so they do not slow the grid down.

## The record panel

Click a row number (or press **Space** on a selected cell) to open the full record. The panel shows every field, the parents it belongs to and the relations it has many of, with a count and the first five records of each. Click any of them to move on without closing the panel, and use the arrow in the header to go back. You can copy the record as JSON or as an `INSERT` statement.

## Tabs, trail and links

Each workspace tab keeps its own history. Use the back and forward arrows (or **Ctrl/⌘+[** and **Ctrl/⌘+]**) to walk it. The breadcrumb shows the path you followed, such as `users › #42 Ana › orders (12)`; click a step to return to it. **Ctrl/⌘+Shift+[** and **]** switch tabs, and **Ctrl/⌘+W** closes one.

Everything you see is in the address: table, filters, sort, page, open record and relation filter. **Copy link** puts it on the clipboard, and opening it elsewhere reproduces the view.
