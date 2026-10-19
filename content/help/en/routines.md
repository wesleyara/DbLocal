---
title: Functions & triggers
description: Browse, create, edit and delete the functions, procedures and triggers stored in your database.
category: Data
order: 8
related: [sql-editor, schema-browser, data-grid]
---

# Functions & triggers

The **Functions & triggers** button in the top bar (or <kbd>⌘</kbd><kbd>K</kbd> → *Open functions & triggers*) lists the logic that lives in the database: functions, procedures and triggers of the current schema, with their full definition.

## Finding things {#finding}

The list on the left groups items by type. Filter by type (pick one or several in the filter box), or search by name or by table (a trigger is found by the table it belongs to). A trigger shows its table, when it fires (`BEFORE INSERT`, `AFTER UPDATE / DELETE`…) and whether it is disabled. While you write a new object or edit one, the other **New …** buttons wait until you save or cancel; leaving unsaved text asks first. The selected item is in the URL, so a link opens the same definition.

> [!NOTE]
> SQLite has no stored functions or procedures, only triggers. MySQL and Postgres have all three. Triggers of a table are one click from its name in the detail header.

## Reading {#reading}

The right side shows the signature, language, return type, comment and the full `CREATE` statement in a read-only editor. **Copy** puts it on the clipboard and **Open in SQL editor** starts a new query with it.

## Creating, editing and deleting {#safety}

- **New function / procedure / trigger** opens a template for your database. For a trigger, pick the table first.
- **Edit** makes the definition editable. **Save** (or <kbd>⌘</kbd><kbd>S</kbd>) shows the exact SQL that will run and asks before running it.
- **Delete** shows the `DROP` statement and asks.
- Postgres triggers can be **disabled** and enabled again without deleting them.

Everything runs through the SQL endpoint, so the usual guards apply: read-only connections hide these actions, `prod` connections ask for confirmation, and each statement lands in the history.

> [!WARNING]
> Postgres replaces a function in place (`CREATE OR REPLACE`). Triggers, and everything in MySQL and SQLite, are dropped and created again; MySQL cannot undo DDL, so a failed new definition leaves the object dropped.
