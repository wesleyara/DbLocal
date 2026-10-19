# Changelog

All notable changes to DbLocal. The project follows [semantic versioning](https://semver.org).

## [Unreleased]

## [1.0.3] - 2026-10-19

### Added
- **grid:** move the More menu after Columns
- **grid:** replace the import/export toggle with a More menu
- **tour:** add steps for safety, structure editing, functions and backup
- **grid:** ask for the connection name when a save deletes rows, following the double check setting
- **settings:** toggle the double check of heavy actions
- **safety:** double-check destructive actions with warnings and the connection name
- **backup:** dump to SQL, restore SQL files, copy SQLite files and back up the workspace
- **schema:** edit table structure and create tables from the UI
- **grid:** collapse import and export behind a right-hand toolbar toggle
- **grid:** import CSV and JSON files into a table
- **mutations:** add upsert op and accept explicit identity values
- **sql-editor:** add snippets and history autosuggestions
- **routines:** sidebar groups, table triggers block and header more menu
- **routines:** browse, create, edit and delete functions, procedures and triggers

### Fixed
- **ui:** polish routines, saved queries, tour and column type picker
- **tour:** point the safety step at the settings button so its card stays on screen
- **grid:** save row deletes without the extra name check
- **backup:** fill the schema of the dump and restore dialogs when they open
- **sql-split:** keep a BEGIN ... END body whole after a leading comment
- **introspect:** report MySQL defaults as SQL and stop flagging expression defaults as generated
- **grid:** soften skipped import errors and recount sidebar rows after writes

### Changed
- **routines:** drop functions and triggers groups from the sidebar

## [1.0.2] - 2026-10-17

### Added
- **drivers:** connect to localhost through host.docker.internal in Docker
- **erd:** drag relation lines sideways and keep chips above them
- **ui:** show skeletons and progress while data loads
- **notes:** add markdown notes and collapsible grid tools
- **query:** add alert before run and upper-case view SQL
- **erd:** add cardinality labels and resizable notes

### Fixed
- **grid:** request relation data again after a remount
- **schema:** fit long names in the virtual relations dialog
- **erd:** spread overlapping cardinality labels
- **help:** wait for the tour target before centring the card
- **schema:** keep the app shell when the database is down
- **editing:** load FK picker records on first open
- **editing:** stop generating key values for new rows

## [1.0.1] - 2026-10-16

### Fixed
- **ui:** keep select, combobox and menu popups inside the viewport

## [1.0.0] - 2026-10-16

### Added
- **grid:** row checkboxes in the gutter and a clearer delete impact dialog
- **grid:** show the related record on the inverse side of 1:1 relations

### Fixed
- **connections:** clearer connection errors and a status bar that follows the connect call
- **shell:** drop the clipped focus ring in the palette and centre the search field

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
