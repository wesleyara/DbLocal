# Changelog

All notable changes to DbLocal. The project follows [semantic versioning](https://semver.org).

## [Unreleased]

## [0.1.5] - 2026-10-15

### Fixed
- **grid:** hover preview on the inverse side of 1:1 relations

## [0.1.4] - 2026-10-15

### Fixed
- **auth:** forward the session cookie on server-side fetches so a reload does not 401
- **help:** keep looking for the tour target until it appears

## [0.1.3] - 2026-10-15

### Added
- **security:** reject non-local Host headers when no password is set

### Fixed
- **security:** hide the exposed warning for local and allowed host names

## [0.1.2] - 2026-10-15

### Added
- **grid:** keep each tab's last view in memory and add a reload button
- **help:** add in-app help centre, contextual hints, demo database and tour

## [0.1.1] - 2026-10-15

### Added
- Docker image built from the checkout (`Dockerfile`, `docker/compose.example.yml`).
- `dblocal` command (`node bin/dblocal.mjs`) with `--port`, `--host`, `--data-dir`, `--readonly`, `--no-open`,
  and an optional connection string or SQLite file that opens straight into the connection.
- `GET /api/health` and `POST /api/connections/open`.
- End-to-end suite for the main flows on SQLite, Postgres and MySQL.

### Fixed
- "Run again" in the query history ran the statement in the old tab and left the new one empty.
- The production build failed on the ERD "create relation" dialog.

### Added
- **release:** local release scripts with a generated changelog and a release workflow
- **cli:** add the dblocal command, health probe and open-connection endpoint
- **grid:** query history dialog in the table view
- **grid:** show nullable, unique and default markers in column headers
- **shell:** status dot in the status bar
- **shell:** app icon, settings dialog, theme icons, product-style home and focus fix
- **shell:** wire palette, search and shortcuts into the layout, i18n, help and docs
- **search:** streaming global data search across the schema
- **palette:** command palette with fuzzy search, actions and record jump
- **shortcuts:** central shortcut registry, grid keys and cheat sheet
- **erd:** size tables to their content instead of truncating names and types
- **erd:** show unique, default, nullable and reference info on columns
- **table:** open structure in a dialog and let the grid fill the page
- **table:** toggleable structure panel with unique, default and reference columns
- **grid:** edit and run the view SQL in place
- **grid:** show the SQL behind the table view and open it in the editor
- **sql-editor:** readable history and saved queries; keep DbLocal - connection as the tab title
- **sql-editor:** show relation chips and key badges in query results
- **erd:** schema diagram with elkjs layout, interactions and persisted positions
- **grid:** restyle relation badges and widen FK preview card
- **connections:** connect to Turso (libSQL) and pick SQLite files
- **sql-editor:** add Monaco editor, saved queries, history, explain and export
- **query:** run raw SQL with cancel, guards and history
- **editing:** add value functions and refine pending changes
- **editing:** edit data with pending changes, SQL preview and batch save
- **workspace:** open tables in preview tabs and add close-all, home link
- **relations:** navigate records through foreign keys, tabs and a record panel
- **grid:** add data grid with filters, sorting and column preferences
- add connections, drivers and schema browser
- add project foundation (epic 01)

### Fixed
- **query:** run history entries in the tab that shows their result
- **erd:** make the relation cardinality select a valid v-model target
- **ui:** follow locale changes in selects, set html lang and show the active connection
- **schema:** load the schema tree before rendering to avoid hydration mismatches
- **ssh:** report unreachable targets and unreadable keys clearly

## [0.1.0]

First internal version: connections, schema browser, data grid, relationship navigation, editing,
SQL editor, ERD, command palette and global search.
