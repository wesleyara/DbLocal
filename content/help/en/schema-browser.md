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
