---
title: SQL editor
description: Write and run queries, keep the ones you reuse, read the history, explain plans and export results.
category: Data
order: 5
related: [data-grid, editing]
---

# SQL editor

**New query** in the top bar opens an editor tab bound to the current connection and schema. The text is kept as you type, so a reload loses nothing.

## Running

- **⌘/Ctrl+Enter** runs the selection, or the statement under the cursor.
- **⌘/Ctrl+Shift+Enter** runs the whole script. Each statement gets its own result tab; a failing statement stops the script and the rest are shown as skipped.
- **Cancel** stops the statement on the server (`pg_cancel_backend`, `KILL QUERY`; on SQLite it stops between rows).
- Results show at most the **row limit** (1000 by default) and say *Result truncated* when there was more. The limit and the 30 s timeout are in the settings button.

## Autocomplete and format

Tables, columns (after `alias.`), functions and keywords are suggested for your dialect. After `JOIN` the editor offers the joins your relations describe, virtual ones included. **Format** (⇧⌥F) tidies the script.

## Safety

- On a read-only connection only reads run; the database enforces it as well.
- On a `prod` connection a statement that writes or changes the schema asks for confirmation first.
- After DDL the schema in the sidebar refreshes by itself.

## Saved queries and history

⌘/Ctrl+S saves the query (it asks for a name the first time). The side panel has **Saved** (open, rename, delete, copy, run) and **History**: every execution with duration, rows and status, searchable and filterable. Clear it any time or choose how many entries to keep.

## Explain and export

**Explain** draws the plan as a tree with cost, rows and, with **Explain analyze**, the time of each node; the heaviest nodes are highlighted. *Analyze runs the statement* (reads only, not on SQLite).

**Export** saves the current result as CSV or JSON, or re-runs the query without the limit and streams it to a file. The table grid has the same export, respecting its filters.
