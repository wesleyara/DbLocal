# Changelog

All notable changes to DbLocal. The project follows [semantic versioning](https://semver.org).

## [Unreleased]

### Added
- Docker image built from the checkout (`Dockerfile`, `docker/compose.example.yml`).
- `dblocal` command (`node bin/dblocal.mjs`) with `--port`, `--host`, `--data-dir`, `--readonly`, `--no-open`,
  and an optional connection string or SQLite file that opens straight into the connection.
- `GET /api/health` and `POST /api/connections/open`.
- End-to-end suite for the main flows on SQLite, Postgres and MySQL.

### Fixed
- "Run again" in the query history ran the statement in the old tab and left the new one empty.
- The production build failed on the ERD "create relation" dialog.

## [0.1.0]

First internal version: connections, schema browser, data grid, relationship navigation, editing,
SQL editor, ERD, command palette and global search.
