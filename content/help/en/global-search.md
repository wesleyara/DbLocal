---
title: Search the data
description: Find a value in any table of the schema, then open the record or the filtered table.
category: Productivity
order: 9
related: [productivity, data-grid]
---

# Search the data

Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> (<kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> on macOS), or choose **Search data in schema** in the command palette, to look for a value in every table of the current schema.

## Contains and exact {#modes}

- **Contains** is a case-insensitive substring over text columns.
- **Exact** compares whole values, including enum, uuid and numeric columns.
- Numbers are only compared with numeric terms, and uuid columns only with a full uuid.

## How it runs {#how-it-runs}

The search runs on demand, four tables at a time, and keeps at most 10 rows per table, so a large schema stays responsive. Results appear as each table answers, grouped by table.

> [!TIP]
> **Cancel**, or closing the dialog, stops the tables that have not started yet. Queries already running finish on their own.

## Using a result {#results}

Click a row to open the record. **Open table filtered** opens the grid with an OR filter that shows every match in that table.
