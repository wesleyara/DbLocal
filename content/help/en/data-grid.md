---
title: Browsing data
description: Read a table in the grid, filter, sort and page through rows, and share a view by its link.
category: Data
order: 2
related: [schema-browser]
---

# Browsing data

Open a table from the sidebar to see its rows in the grid. The grid reads a page at a time, so large tables stay fast.

![The data grid with foreign key chips](/help/shots/grid-{theme}.png)

## Sort

Click a column header to sort ascending, click again for descending, and click a third time to remove the sort. Hold **Shift** to add a column to the sort without dropping the others.

## Columns

Drag a header onto another to move the column. Hover a header and click the pin icon to keep it on the left while you scroll sideways. The **Columns** menu hides or shows columns, and **Reset columns and widths** puts everything back. Drag the right edge of a header to resize it. These choices are saved for each table.

## Sort chips

The sort bar above the grid lists each sort. Click a chip to flip its direction, drag it to change the order, or use its **×** to remove it.

## Toolbar {#toolbar}

Above the grid, **Filter** and **Structure** are always visible. The **»** button next to them shows the other tools, the way the browser devtools hide their overflow: **Advanced filters**, **Show SQL**, **History** and **Notes** (see [Notes](notes)). DbLocal remembers whether you left them open. While they are hidden, a dot on **»** tells you the SQL bar is open or the table has notes. The "Updated" label and the reload button stay on the right of the toolbar.

## Filter {#filter}


Click **Filter** to add a condition. **Advanced filters** (behind **»**) opens a tree where you combine conditions with AND and OR, nested up to three levels: pick a column, an operator and a value. Each condition becomes a chip. Click a chip to edit it, or use its **×** to remove it. **Clear all** removes every condition.

The operators offered depend on the column type:

- **Numbers and dates**: is, is not, greater or less than, between, is one of.
- **Text**: contains (case-insensitive), starts with, ends with, is, is not.
- **Booleans**: is true, is false.
- **Any column**: is NULL and is not NULL.

Use the comma to type several values for "is one of". `NULL` and an empty text are different: a NULL shows a grey **NULL** badge.

## Values

Double-click a cell to see its full value. JSON opens as a tree you can collapse. Binary values can be downloaded as stored. The dialog also has **Filter by this value**.

## Pages and counts

Choose how many rows a page shows (50, 100, 250 or 500). The footer shows the range and the total. For very large tables the total is an estimate, marked with `~`. Click **Count exactly** to count the real number of rows.

## What you see is the last loaded state {#cached-view}

Each tab remembers the last view it loaded: leaving the tab and coming back shows it at once, without asking the database again. The toolbar says when the rows were read ("Updated 3 minutes ago"). Nothing is refreshed on its own: click the reload button next to it, or press <kbd>Ctrl</kbd>+<kbd>R</kbd> (<kbd>⌘</kbd>+<kbd>R</kbd> on macOS), to read the database again. Saving changes or running a statement that writes does it for you. The memory is dropped when you close the tab or reload the page.

## Share a view

Sort, filters and the page are part of the address in your browser. Copy the link to open the same view again.

## Tables without a primary key {#tables-without-a-primary-key}

A table without a primary key can be read, filtered and sorted, but its rows are read-only. The grid shows a notice when this happens.
