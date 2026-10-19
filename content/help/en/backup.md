---
title: Backup and restore
description: Dump a database to SQL, restore a SQL file, copy a SQLite file, and move DbLocal itself to another machine.
category: Data
order: 9
related: [connections, sql-editor, schema-browser]
---

# Backup and restore

DbLocal backs up a database without `pg_dump` or `mysqldump`: it reads the schema and the rows itself and writes a `.sql` file that it can run again. Open it from the backup button on a connection card, from **More** in the top bar, or with <kbd>⌘</kbd><kbd>K</kbd> → *Back up the connection*.

## SQL dump {#dump}

**Dump to SQL…** downloads one schema (Postgres) or database (MySQL, SQLite) as SQL:

- **Structure**: tables with their keys, indexes and foreign keys, Postgres enum types, views, functions, procedures and triggers.
- **Data**: every row, as `INSERT` statements of 100 rows, read page by page so a large table never sits in memory.
- **Only some tables** dumps the tables you tick (and their triggers); views and routines are left out then.

Table names are written without a schema, so the file restores into whatever schema or database you point it at. Foreign keys are added after the rows (Postgres, MySQL) or checked off during the load (SQLite), so the order of the rows never breaks them; Postgres identity sequences are moved past the loaded ids, and triggers are created last so they do not fire on the loaded rows.

> [!NOTE]
> A dump is DbLocal's portable view of the schema: it does not carry grants, extensions, sequences used elsewhere, partitions or other server settings. For a full copy of a server, use the database's own tools.

## SQLite file copy {#sqlite-file}

For a SQLite file connection the dialog also has **Download .sqlite file**: an exact copy made with SQLite's online backup, safe while the file is in use.

## Restore {#restore}

**Restore from SQL…** runs a `.sql` file (a DbLocal dump or any script) in the schema or database you choose, statement by statement, with a progress bar. It is checked twice first: **Review** reads the file and says how many statements will run where, listing the destructive ones (`DROP`, `TRUNCATE`, `DELETE` without `WHERE`, ...); then **Restore** stays off until you type the connection's name. It stops at the first error and shows the statement and the database message; what ran before it stays. Restore a dump into an empty schema or database: it creates the tables.

> [!WARNING]
> Read-only connections cannot restore, and the server refuses a restore that was not confirmed. Statements of a restore are not added to the query history.

## Workspace backup {#workspace}

In **Settings → Workspace backup**, **Export** saves DbLocal's own data as a `.json` file: connections, saved queries, virtual relations, notes, ERD layouts and grid settings, and optionally the query history.

- With a **password** (8 characters or more), the connection passwords and keys are encrypted with it (scrypt and AES-256-GCM), so the file works on another machine whatever its `secret.key`.
- Without a password the secrets are left out: server connections ask for their password again after the import.

**Import** merges a backup into this installation: items with the same id are replaced, everything else is kept.
