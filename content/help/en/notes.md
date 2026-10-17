---
title: Notes
description: Keep Markdown notes about a connection and about each table, saved as you type.
category: Data
order: 7
related: [data-grid, erd, schema-browser]
---

# Notes

DbLocal keeps free Markdown notes next to your data: one for each connection and one for each table. Use them for what the schema does not say: what a database is for, who owns it, which column is deprecated, the query you always need.

> [!NOTE]
> Notes live in DbLocal's own store (`dblocal.db` in the data dir), never in your database. Nobody else connecting to the database sees them.

## Connection notes {#connection-notes}

Click **Notes** in the top bar, next to **Diagram**. The note opens in its own workspace tab, one per connection: the same note whatever schema you are browsing.

## Table notes {#table-notes}

In a table, open the toolbar's extra tools with **»** and click **Notes**. The note belongs to that table in that schema. A dot on **Notes** (and on **»** while the tools are hidden) tells you the table has one.

## Writing {#writing}

The editor is plain Markdown with a toolbar for the usual formatting: bold, italic, headings, lists, task lists, quotes, links, images, tables, code blocks and an **SQL block**. **Diagram** inserts a [mermaid](https://mermaid.js.org) block, drawn in the preview (an `erDiagram` is a good start).

- **Editor** / **Preview** switch between writing and reading.
- The expand button opens the note full screen.
- Every change is saved a moment after you stop typing; the line above the editor says when it was last saved. Clearing all the text deletes the note.

> [!TIP]
> Code blocks tagged `sql`, `postgres`, `mysql`, `json`, `bash`, `ts` or `python` are highlighted. Nothing is loaded from the internet: the editor works offline.
