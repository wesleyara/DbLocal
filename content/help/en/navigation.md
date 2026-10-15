---
title: Tabs, trail and links
description: Move between records and tables, go back, keep several views open and share any view as a link.
category: Data
order: 3
related: [relationships, keyboard-shortcuts]
---

# Tabs, trail and links

DbLocal keeps your place as you move through the data, so following a relation never costs you the view you came from.

## The record panel {#record-panel}

Click a row number, or press <kbd>Space</kbd> on a selected cell, to open the record in a side panel. It lists every field, the parents the record belongs to and the relations it has many of. Click any of them to move on without closing the panel; the arrow in the header goes back one step.

## Tabs {#tabs}

Each workspace tab is a table, a record, a query or a diagram, and each keeps its own history.

- Click a table in the sidebar to open it; double-click, or use <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + click on a chip, to keep it in its own tab.
- <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd> and <kbd>]</kbd> switch tabs; <kbd>Ctrl</kbd> + <kbd>W</kbd> closes one.
- A tab with unsaved changes asks before it closes.

## Trail and history {#trail}

The breadcrumb under the tabs shows the path you followed, such as `users › #42 Ana › orders (12)`. Click a step to return to it. The back and forward arrows (or <kbd>Ctrl</kbd> + <kbd>[</kbd> and <kbd>]</kbd>) walk the tab's history, and the browser's own Back button does the same.

## Deep links {#deep-links}

Everything you see is in the address: the table, the filters, the sort, the page, the open record and the relation filter. **Copy link** puts it on the clipboard, and opening it elsewhere reproduces the view.

> [!NOTE]
> A link only reproduces the view, not your data: whoever opens it needs the same connection saved on their machine.
