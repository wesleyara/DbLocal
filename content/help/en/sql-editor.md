---
title: SQL editor
description: Write and run queries, keep the ones you reuse, read the history, explain plans and export results.
category: Data
order: 5
related: [data-grid, editing]
---

# SQL editor

**New query** in the top bar opens an editor tab bound to the current connection and schema. The text is kept as you type, so a reload loses nothing.

![The SQL editor with a result](/help/shots/sql-editor-{theme}.png)

## Running {#running}

- **⌘/Ctrl+Enter** runs the selection, or the statement under the cursor.
- **⌘/Ctrl+Shift+Enter** runs the whole script. Each statement gets its own result tab; a failing statement stops the script and the rest are shown as skipped.
- **Cancel** stops the statement on the server (`pg_cancel_backend`, `KILL QUERY`; on SQLite it stops between rows).
- Results show at most the **row limit** (1000 by default) and say *Result truncated* when there was more. The limit and the 30 s timeout are in the settings button.

## Autocomplete and format

Tables, columns (after `alias.`), functions and keywords are suggested for your dialect. After `JOIN` the editor offers the joins your relations describe, virtual ones included. **Format** (⇧⌥F) tidies the script.

### Snippets {#snippets}

Type the start of a statement (`create`, `alter table`, `insert`, …) and pick a snippet: create table, table with a foreign key, junction table for N:N, index, unique index, view, add column, add foreign key, rename or drop a column, insert, update, delete, upsert, CTE, transaction (and `create type … as enum` on Postgres). Tab moves through the fields; table fields offer the tables of the schema and `ON DELETE` offers its actions. The SQL follows your dialect (identity on Postgres, `AUTO_INCREMENT` on MySQL, `AUTOINCREMENT` on SQLite; SQLite adds a foreign key as a new column with `REFERENCES`).

After `alter table users ` the snippets fill in the table, and inside `create table … (` you get `id`, `timestamps`, `references` and one `fk → table` per table, typed like that table's key.

### History suggestions {#history-suggestions}

While you type, the rest of the newest query of this connection that starts the same way (from the history of successful runs and the saved queries) shows in grey, like zsh-autosuggestions. <kbd>→</kbd> or <kbd>Tab</kbd> accepts it, <kbd>⌥→</kbd> takes one word, keep typing to ignore it. It only shows at the end of a line. Turn it off in the query settings.

## Safety {#safety}

- On a read-only connection only reads run; the database enforces it as well.
- On a `prod` connection a statement that writes or changes the schema asks for confirmation first.
- After DDL the schema in the sidebar refreshes by itself.

### Destructive statements {#destructive}

`DROP`, `TRUNCATE`, `DELETE` or `UPDATE` without `WHERE`, and `ALTER TABLE ... DROP` (a column, key or constraint) always open the confirmation, whatever the **Alert before run** setting, on every connection. It says what each one destroys, and **Run** stays off until you type the connection's name. The same check covers the structure editor (drop table, drop column), deleting a function or trigger, and the table's **Show SQL** bar. The server refuses these statements unless the confirmation was given, so a script sent by other means cannot skip it.

> [!WARNING]
> The check reads the statements, it does not know your data: a `DELETE` with a `WHERE` that matches every row is not flagged. Back up before large changes.

### Alert before run {#alert-before-run}

Tick **Alert before run** (in the editor toolbar or in the table's **Show SQL** bar; one setting for both) and every run first lists the statements about to execute, each marked *read*, *write*, *schema* or *unknown* with what it does. Nothing runs until you confirm. On a `prod` connection this confirmation also counts as the production one.

The SQL of a table view (**Show SQL**) is written with keywords in upper case, like the editor's autocomplete.

## Saved queries and history

⌘/Ctrl+S saves the query (it asks for a name the first time). The side panel has **Saved** (open, rename, delete, copy, run) and **History**: every execution with duration, rows and status, searchable and filterable. Clear it any time or choose how many entries to keep. The same history is available from any table: the **History** button next to **Structure** lists it, filtered to that table by default, and can run an entry again in the editor.

## Explain and export

**Explain** draws the plan as a tree with cost, rows and, with **Explain analyze**, the time of each node; the heaviest nodes are highlighted. *Analyze runs the statement* (reads only, not on SQLite).

**Export** saves the current result as CSV or JSON, or re-runs the query without the limit and streams it to a file. The table grid has the same export, respecting its filters, behind the `«` toggle on the right of its toolbar.
