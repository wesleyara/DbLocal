---
title: Schema browser and virtual relations
description: Browse the tables of a schema, see how they relate, and declare relations that have no foreign key in the database.
category: Getting started
order: 2
related: [connections]
---

# Schema browser and virtual relations

The sidebar lists the tables and views of the schema you are working in. Each table shows its estimated row count. Expand a table to see its columns and its relations.

## Browse the tables

- **Filter**: type part of a name. Letters must appear in the same order, so `ord` finds `orders`.
- **Open a table**: click it, or select it with the arrow keys and press Enter. The table opens with its columns and relations, and the address keeps the table, so you can bookmark it.
- **Expand or collapse**: click the arrow, or use the right and left arrow keys.
- **Keyboard**: the up and down arrows move between tables, Home and End jump to the first and last.

## Relations

A relation links two tables. The sidebar shows the name you navigate by, for example `orders.user` from `orders` to `users`, and the reverse `users.orders`.

- A relation with a foreign key in the database is a normal relation.
- A **virtual relation** is one you declare yourself. It has a dashed outline and a dot in the sidebar.

## Add a virtual relation {#add-a-virtual-relation}

1. Click the **link** button at the top of the sidebar.
2. Pick the table and column on each side, and the cardinality.
3. Optionally give it a name.
4. Click **Save relation**.

DbLocal checks the relation before saving. It rejects a table or column that does not exist, columns of incompatible types, and a relation that already exists.

Edit or delete a virtual relation from the same dialog.

## Display column {#display-column}

Every table has a column that represents one of its rows, such as `name` or `title`. DbLocal picks it for you. To choose another one, open the table's menu and select **Set display column**. Choose **Automatic** to go back to the default.

## Refresh the schema

DbLocal keeps the schema in memory so that browsing is fast. After you change the database outside DbLocal, click **Refresh schema** in the sidebar.

## Editing the structure {#editing-the-structure}

**Structure** (in the grid toolbar) shows the columns, relations and triggers of a table. On a table of a connection that is not read-only, **Edit structure** turns it into a form:

- **Columns**: rename, change the type (suggestions per database, any type can be typed), NULL and the default, add or remove. The default is an SQL expression: `'text'` with quotes, `0`, `now()`. The primary key and identity columns are kept as they are.
- **Indexes** and **foreign keys**: remove an existing one or add a new one (columns, unique; target table and column, `ON DELETE` / `ON UPDATE`).
- **Table name**, and **Drop table**.

**Review and run** builds the DDL and shows it in the run confirmation before anything is sent; it goes through the SQL editor's endpoint, so read-only, `prod` and history apply. Postgres and SQLite run the script in one transaction. MySQL commits each statement on its own, so a failure halfway leaves the earlier ones applied, and changing a column restates it whole (`MODIFY`, keeping auto-increment, `ON UPDATE` and the comment).

SQLite's `ALTER TABLE` only renames and adds or drops plain columns. For anything else (a type, NULL or default change, a foreign key, a unique constraint written in `CREATE TABLE`) the table is rebuilt: a new table, the rows copied, the old one dropped and the new one renamed, with its indexes and triggers created again, in one transaction. Tables with generated columns cannot be rebuilt this way.

**New table** (the `+` button in the sidebar, or ⌘K) opens the same form for a new table, starting with an auto-increment `id` primary key.

> [!WARNING]
> Changing the type of a column on a large table rewrites it and can lock it for a while. Values that do not convert make the statement fail.
