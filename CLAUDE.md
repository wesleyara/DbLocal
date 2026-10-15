# DbLocal

Local web database browser (Prisma Studio–style) with explicit, navigable relations, saved
connections and a SQL editor. Nuxt 4 full-stack: UI in `app/`, API in `server/` (Nitro).

## Stack
- Nuxt 4, TypeScript strict, pnpm, Node 22 (`.nvmrc`). TypeScript is pinned to 5.9 (typescript-eslint / vue-tsc do not support 7).
- Kysely as the multi-dialect query builder; better-sqlite3 for the internal store.
- UI: Reka UI (headless) + Tailwind v4 with own tokens. No component libraries (Nuxt UI, shadcn).
- Fonts: Inter (UI), JetBrains Mono (`font-data` class: cells, SQL, identifiers) via `@nuxt/fonts`.
- State: Pinia. i18n: `@nuxtjs/i18n` (EN, pt-BR).

## Layout
```
app/            components/ui (design system), layouts, pages, stores, composables, plugins
server/         api/, middleware/, plugins/, store/ (internal SQLite + migrations), utils/
shared/types/   types shared by app and server
i18n/locales/   en.json, pt-BR.json
fixtures/seed/  postgres.sql, mysql.sql, sqlite.sql (same relational model)
docker/         compose.dev.yml (Postgres 17 on 54329, MySQL 8.4 on 33069)
tests/          unit/, integration/ (nuxt test-utils, builds the app), e2e/ (Playwright)
```

## Scripts
`pnpm dev` (127.0.0.1:5555) · `build` · `lint` · `typecheck` · `test` (unit, fast) ·
`test:integration` (builds the app; covers open and password modes) · `test:e2e` (Playwright, uses system Chrome locally) ·
`db:up` / `db:down` / `db:seed` (dev databases; SQLite goes to `fixtures/dev.sqlite`).
Dev DB credentials: user/password `dblocal`, database `dblocal_dev`.

## Design system
- Tokens live in `app/assets/css/main.css` as CSS variables (`--bg`, `--surface`, `--border`, `--fg`, `--accent`, `--danger`, ...), exposed to Tailwind via `@theme inline` (`bg-surface`, `text-fg-muted`, ...). Dark is the default; light via `data-theme="light"` on `<html>`.
- Never hardcode colours: use tokens. Data-type colours: `text-type-*`; environment colours: `text-env-*`.
- Components are in `app/components/ui/` and auto-imported with the `Ui` prefix (`UiButton`). `/_design` (dev only) shows all of them.
- Theme (`dark | light | system`), sidebar width/collapse persist in localStorage key `dblocal-ui`; an inline head script applies the theme before paint.

## i18n
No hardcoded user-facing text in components: use `t('domain.key')`. Keys are grouped by domain in `i18n/locales/*.json`; `tests/unit/i18n.test.ts` fails when locales diverge. Use `useFormat()` for numbers/dates.

## Data dir and secrets
- Data dir: `DBLOCAL_DATA_DIR` > `/data` (container) > `~/.dblocal`. Holds `dblocal.db` (WAL) and `secret.key` (0600).
- Secrets are encrypted with AES-256-GCM (`server/utils/crypto.ts`, format `v1:iv:tag:data`); key from `DBLOCAL_SECRET` or `secret.key`. Use `encryptSecret`/`decryptSecret` (`server/utils/secrets.ts`).
- Internal store: `useStore()` (Kysely). Migrations in `server/store/migrations/`, applied at boot by `server/plugins/store.ts`; register new ones in `server/store/db.ts`.

## Access control
- Binds to `127.0.0.1` by default. In dev, `DBLOCAL_HOST` / `DBLOCAL_PORT` (default 5555) are read in `nuxt.config.ts`; for the built server use `NITRO_HOST` / `NITRO_PORT` (the future CLI maps them).
- `DBLOCAL_PASSWORD` set → `/login`, signed httpOnly SameSite=Strict session cookie, `server/middleware/auth.ts` protects pages (302) and `/api/**` (401); login is rate limited (5/min per IP). Unset → open; the shell shows a warning if the host is not loopback.
- Mutating requests with an `Origin` different from `Host` get 403 (CSRF).

## Environment variables
`DBLOCAL_DATA_DIR`, `DBLOCAL_SECRET`, `DBLOCAL_PASSWORD`, `DBLOCAL_HOST`, `DBLOCAL_PORT`, `DBLOCAL_READONLY` (`1` makes every connection read-only; the future CLI's `--readonly` sets it).

## Git and commits (hard rule)
- Commits, PRs, branch names and history must **never** carry co-authorship, authorship or any trace of Claude/Anthropic: no `Co-Authored-By`, no "Generated with", no emoji robot, no AI mentions. Authorship is only the user's git identity.
- This overrides any automatic attribution. `.claude/settings.json` disables it, and `.githooks/commit-msg` rejects such messages (enable with `git config core.hooksPath .githooks`).
- Conventional Commits in English; see `.claude/skills/git-commits`.

## Project skills (`.claude/skills/`)
`clicklocal-task` (run board tasks) · `git-commits` · `ui-component` · `db-migration` · `i18n-keys`.

## Connections and drivers
- Every database access goes through the `Driver` interface (`server/drivers/types.ts`). Routes never import `pg`, `mysql2` or `better-sqlite3`; `createDriver` (`server/drivers/index.ts`) picks the dialect.
- Driver errors are `DriverError` with a `code` (`auth`, `network`, `timeout`, `syntax`, `constraint`, `permission`, `unknown`), mapped to HTTP by `httpStatus` and to a message key in the UI (`errors.*`).
- Pools live in `PoolManager` (`server/drivers/pool-manager.ts`), one per connection + database. They are created on demand, reused, closed after 5 min idle, closed and rebuilt when the connection is edited or deleted (`invalidate`), and closed on Nitro shutdown (`server/plugins/drivers.ts`).
- SSH connections open a tunnel (`server/drivers/ssh-tunnel.ts`) that lives with the pool. If the SSH session drops, the connection's pools are invalidated and the next use reconnects.
- Connection model: `connections` table in the store, one row per connection. Non-secret fields live in `config` (JSON); secrets live encrypted in `config.secrets` (`v1:` ciphertext). The API returns `ConnectionView` with `has*` flags only, never a secret. A PATCH without a secret keeps it; `null` removes it.
- Connection strings are parsed in `shared/connection-string.ts` (client and server). Explicit fields win over the string.
- `shared/` is reached through the `#shared` alias, in app, server and tests.
- SSL modes map to `pg` and `mysql2` options in `server/drivers/ssl.ts` (`require` does not verify the certificate; `verify-ca` skips the host name check).
- Namespaces: `POST /api/connections/:id/connect` lists schemas (Postgres) or databases (MySQL, SQLite), marks the connection as used, and returns system namespaces so the UI can hide them.
- Help articles for this feature are in `content/help/en/connections.md` and `content/help/pt-BR/connections.md`.

## Schema introspection and relation graph
- `Driver.introspect(schema)` returns a `SchemaSnapshot` (`shared/types/db.ts`), the same shape for the three dialects. Each dialect reads its catalog in `server/drivers/introspect/{postgres,mysql,sqlite}.ts` (`pg_catalog`, `information_schema`, `PRAGMA`). A column has `kind` (`ColumnKind`), `nativeType`, `nullable`, `default`, `isGenerated`, `isPrimaryKey`, `enumValues`.
- `buildRelationGraph(snapshot, virtual, { displayOverrides })` (`server/schema/relation-graph.ts`) is pure and turns FKs into relations: N:1 from the FK side, 1:N in reverse, 1:1 when the FK columns are a PK or unique index, N:N through a junction whose PK is covered by its two FKs (or that holds only FKs and timestamps). Composite FKs stay whole. Names: `orders.user` / `users.orders`; duplicated FKs use the column (`orders.billingAddress`, inverse `addresses.ordersByBillingAddress`). N:N names use the target table names (`products.tags`). The graph exposes `outgoing` and `incoming` refs per table; N:N refs are outgoing on both sides.
- The display column is inferred (`name`, `title`, `label`, `email`, then the first text column that is not a PK) and can be overridden per table (`preferences`, key `display-column|connection|schema|table`).
- Virtual relations live in `virtual_relations` (`definition` JSON), are validated against the live snapshot (tables and columns exist, kinds compatible) and are merged with `virtual: true`.
- Snapshots are cached per connection + schema in `server/schema/service.ts`. `POST /api/c/:id/schema/refresh` and connection edit or delete invalidate them. The graph is rebuilt on every read, so virtual relation and display changes need no invalidation.
- Routes: `GET /api/c/:id/schema?schema=`, `POST /api/c/:id/schema/refresh`, `GET|POST /api/c/:id/virtual-relations`, `PATCH|DELETE /api/c/:id/virtual-relations/:rid`, `PUT /api/c/:id/display-column`.

## Data grid (row reads)
- Rows come from `POST /api/c/:id/tables/:table/rows` (`{ schema, filter, sort, limit, offset, columns? }`, limit ≤ 500) and `POST .../count` (`{ schema, filter, exact }`). Request types are in `shared/types/rows.ts`, zod schemas in `shared/schemas/rows.ts`.
- Filters are a `FilterNode` AST: `condition` (`column`, `op`, `value`) or `group` (`and`/`or`, nested, max depth 4 and 100 nodes). `planRows` (`server/query/plan.ts`) checks the table, columns, and that the operator is allowed for the column `kind` (`OPERATORS_BY_KIND`) and that the value shape matches the operator (`operatorArity`). Anything else is a 400 (404 for an unknown table).
- The SQL is built with Kysely in `server/query/compile.ts` (compile only, no pool): values are parameters, `contains` uses `ILIKE` on Postgres and `lower(...) like lower(...)` elsewhere, with `!` as the LIKE escape. Drivers run the compiled SQL on their own pool (`readRows` / `countRows` on `Driver`).
- The primary key is always appended to the sort, so paging is stable. Rows are serialised by `server/query/serialize.ts` (dates to ISO, bigint to string, binary to a truncated base64 preview).
- Count: with no filter and a catalogue estimate above `EXACT_COUNT_THRESHOLD` (100k), `exact: false` returns the estimate; filtered counts are always exact.
- Grid state lives in the URL: `f` (filter AST, base64url JSON), `s` (sort), `p` (page), `size` (page size). Codec: `shared/grid-url.ts`. Composable: `app/composables/useTableRows.ts`. Components: `app/components/grid/` (`TableGrid`, `DataGrid`, `FilterBar`, `FilterEditor`, `GridFooter`, `cells/CellValue`). The grid is shown on the schema page with `?table=`.
- Tests: unit tests for planner, compiler and SQLite reads run in `pnpm test`. `server/query/dev-db-rows.test.ts` runs against the dev Postgres and MySQL when `DBLOCAL_DEV_DB=1`.
- Grid preferences per table (`GET/PUT /api/c/:id/tables/:table/prefs?schema=` / body `{ schema, prefs }`): widths, hidden, order and pinned columns, stored as JSON in `preferences` under `grid-prefs|connection|schema|table` (`server/query/prefs.ts`). Pinned columns are always the first ones in display order.
- Binary download: `POST /api/c/:id/tables/:table/blob` with `{ schema, column, key }`, where `key` is the row's primary key. Returns the stored bytes as `application/octet-stream` (up to 50 MB); never the grid preview.
- Advanced filters: `FilterTree` (`app/components/grid/FilterTree.vue`) edits the whole AND/OR tree in a dialog; the flat chips in `FilterBar` cover only the top-level AND list.
- E2E: `tests/e2e/grid.spec.ts` creates a throw-away SQLite connection through the API and removes it afterwards.

## Relationship navigation
- Endpoints (`server/query/relations-service.ts`): `POST /api/c/:id/tables/:table/relations/resolve` with `{ schema, rows: pk[], relations?: names[] }` returns, aligned with `rows`, `parents` (N:1 / 1:1 FK side: `{ key, label }` or `null`) and `counts` (1:N, inverse 1:1, N:N) by relation name. One `WHERE key IN (...)` per parent relation and one `GROUP BY` per count (`Driver.countGroups`), plus one read of the source rows, whatever the number of rows. `GET .../tables/:table/record?schema=&pk={json}` returns the full row plus the same resolved relations. Both need a primary key (400 otherwise).
- Scope: `rows` and `count` accept `scope: { table, relation, key }` ("records of `table` #key reached through the ref named `relation`"). `resolveScope` turns it into an equality filter (1:N, N:1) or a `junction` subquery on the plan (N:N, `(cols) in (select ... from junction where ...)`), composite keys included.
- URL: path `/c/:id/:schema/t/:table`; query `f`, `s`, `p`, `size` (grid), `r` (record in the panel, `encodeRecord`, carries its table when it differs from the page's) and `rel` (scope, `encodeScope`). Codecs in `shared/nav-url.ts`. A view is reproducible from its URL alone.
- Workspace (`app/stores/workspace.ts`): tabs per connection, persisted in localStorage `dblocal-workspace` (the active tab id lives in sessionStorage, so a deep link in another browser tab does not steal it). Each tab has its `path`, a `history` of `{ path, trail }` with `index`, and a breadcrumb `trail`. The route is the source of truth: the layout calls `sync()` on every route change; a relation hop announces its breadcrumb segment with `expect()` first (`useRelationNav`), anything else resets the trail. Back/forward navigate to the neighbouring history path and `sync` recognises it (so browser back works too).
- Grid: `useRelationData` batches the rows the grid reports as visible (`@visible`); FK cells are `cells/ForeignKeyCell.vue`, count columns are synthetic columns named `@rel:<relation>` (hidden/ordered like real ones, not sortable or filterable) drawn by `cells/RelationCountCell.vue`. The record side panel is `components/record/RecordPanel.vue`, opened by the row number or Space.
- Help: `content/help/{en,pt-BR}/relationships.md`.

## Data editing
- Endpoint: `POST /api/c/:id/mutations` with `{ schema, ops, dryRun? }` (`shared/types/mutations.ts`, zod in `shared/schemas/mutations.ts`, max 1000 ops). An op is `{ type: 'insert', table, values }`, `{ type: 'update', table, pk, values }` or `{ type: 'delete', table, pk }`. A value is the JSON value of the column, `null` (NULL), `{ $default: true }` (column default) or `{ $binary: base64 }`. Response: `statements` (`sql`, `parameters`, and a `preview` with the values inlined, for display only) and `results` (`affected`, and the written `row` from `RETURNING`, or a re-select by key on MySQL). `dryRun` validates and compiles, runs nothing.
- Server path: `planMutations` (`server/query/mutation-plan.ts`) validates against the live snapshot (table exists and is a real table, has an editable key, columns exist and are not generated, key given exactly) and coerces values by `kind` (numbers, booleans, JSON as text, bytes, ISO datetimes). `compileMutation` (`compile-mutations.ts`) builds parameterised SQL; `runMutations` (`run-mutations.ts`) runs the plan on a driver transaction (`Driver.applyMutations`, BEGIN / COMMIT / ROLLBACK in each driver). Inserts run first, then updates, then deletes.
- Editable key (`shared/editable.ts`): the primary key, or a unique index whose columns are all NOT NULL. Views, tables without one and SQLite's implicit rowid are read-only (400). Update and delete address the row by key (`WHERE pk = :pk`), never by position; a key that matches no row fails the batch (stale row). `DEFAULT` on an update is rejected on SQLite (no `SET col = DEFAULT`).
- Failures: any failing op rolls back the whole batch and answers with the op's HTTP status and `data: { code, errors: [{ index, code, message }] }` (`MutationFailedError`, mapped in `server/connections/http.ts`); `index` is the position in `ops`. Validation failures carry the index too (400).
- Read-only: the connection flag or `DBLOCAL_READONLY` refuses with 403 before anything is validated. `ConnectionView.readonlyGlobal` tells the UI; with either flag the grid, the record panel and the pending bar offer no editing. `prod` connections need the connection name typed at save (UI only).
- Time zones: MySQL pools use `timezone: 'Z'` and `SET time_zone = '+00:00'`, and Postgres reads `timestamp` (no zone) as UTC, so an edited datetime reads back as the same instant whatever the server's zone.
- Pending changes: pure rules in `shared/pending.ts` (`setCell`, `setDeleted`, `addInsert`, `buildOps`, ...), kept per workspace tab in `app/stores/pending-changes.ts` (memory only; closing a tab discards them, a tab with pending edits is `dirty`). `buildOps` drops edits that return to the loaded value and sends only a delete for a deleted row. A successful save bumps `usePendingStore().version`: the grid, the relation data and the record panel reload on it. Value parsing and validation per kind: `shared/edit-values.ts`.
- UI: `TableGrid` overlays the pending state on the loaded rows (`@meta` property, `components/grid/row-meta.ts`: new / deleted / changed cells / error) and `DataGrid` draws and edits cells (`editors/CellEditor.vue` inline, `editors/ValueDialog.vue` for JSON, arrays; booleans toggle; FK columns open `editors/FkPicker.vue`). `PendingBar.vue` is the floating "N pending changes · Discard · Preview SQL · Save" bar (⌘/Ctrl+S); `DeleteImpactDialog.vue` shows the 1:N relations that point at the rows being deleted with their `ON DELETE` action. The record panel edits the same pending store, and "Create related" adds a new row of the child table with the FK filled.
- Tests: `server/query/sqlite-mutations.test.ts` (planning, transactions, round trips), `server/query/dev-db-mutations.test.ts` (Postgres and MySQL, `DBLOCAL_DEV_DB=1`), `shared/pending.test.ts`, `shared/edit-values.test.ts`, `tests/integration/mutations-api.test.ts`, `tests/e2e/editing.spec.ts`. The e2e spec reseeds its SQLite file in place: never delete it, the server keeps it open.
- Value functions (`shared/edit-functions.ts`): typing `uuid()`, `cuid()`, `cuid2()`, `ulid()`, `nanoid()` (text columns; `uuid()` only on uuid columns), `now()` (datetime, date, time, text) or `increment()` (number) in a cell is expanded by `parseInput`; `functionsFor(column)` says which apply (also the editor placeholder and the "Generate" context menu). Wrapping the call in quotes (`"now()"`) stores the text. Client-side functions become the generated value at once (visible in the grid and in "Preview SQL"); `increment()` stays a `{ $fn: 'increment' }` marker that the server compiles to `max(col) + 1` inside the save transaction (`INCREMENT_MARK`, derived table for MySQL error 1093; not safe against concurrent writers, use a sequence for that). New rows get a UUID for text/uuid primary keys without a default (`generatedKeyValues`).
- Help: `content/help/{en,pt-BR}/editing.md`.


## Raw SQL execution
- Endpoints: `POST /api/c/:id/query` with `{ sql, schema?, limit?, timeoutMs?, queryId?, confirmWrites? }` (`shared/types/query.ts`, zod in `shared/schemas/query.ts`) and `POST /api/c/:id/query/:queryId/cancel` → `{ cancelled }`. Service: `server/query/raw-query-service.ts`.
- Splitting and classification are shared with the client (`shared/sql-split.ts`): `splitStatements(sql, dialect)` splits on top-level `;` (strings, quoted identifiers, `--`, `#` (MySQL), nested `/* */` (PG), `$tag$` bodies (PG), trigger `BEGIN ... END`); `statementAt` finds the statement under a cursor offset; `classifyStatement` returns `read | write | ddl | other` from the leading keyword (looks into `WITH` bodies and `EXPLAIN ANALYZE`, `SELECT INTO` is ddl/other, `PRAGMA x = y` is write). It is a heuristic: unknown statements are `other`.
- Response: one `StatementResult` per statement (`columns` name + type, `rows` as objects with unique keys — repeated names become `id`, `id_2` —, `rowCount`, `affectedRows`, `durationMs`, `truncated`, `notices`, `status` `ok|error|cancelled|timeout|skipped`, `error`). A failing statement ends the batch (the rest are `skipped`) and the HTTP status stays 200; failures before anything runs are 4xx.
- Guards, before any statement runs: read-only (connection flag or `DBLOCAL_READONLY`) refuses everything that is not `read` with 403 `permission`; on `prod`, `write`/`ddl` need `confirmWrites: true` or the answer is 409 `{ data: { code: 'confirmation_required', kinds } }`. The database enforces readonly as well: PG `BEGIN READ ONLY`, MySQL `SET SESSION TRANSACTION READ ONLY` (not `START TRANSACTION READ ONLY`, whose implicit commit lets DDL through), SQLite opens the file `readonly`.
- Drivers expose `openQuerySession({ schema, readonly })`: a dedicated connection for the whole script (so `SET`/`USE` carry over) with `run(sql, limit)`, `cancel()` and `close({ discard })`. Rows are read up to `limit + 1` (PG through `pg-cursor`, MySQL by streaming and `KILL QUERY` once past the limit, SQLite with `iterate`), so a huge result never sits in memory. A session that ran `other` statements is discarded (`DISCARD ALL` / destroyed connection).
- Limits: `limit` default 1000 (max 100 000), `timeoutMs` default 30 s (max 10 min) per statement, at most 200 statements and 1 MB of SQL. Timeout and cancel both call `session.cancel()`: `pg_cancel_backend`, `KILL QUERY`, and for SQLite a flag checked every ~25 ms between rows (a single step that yields no rows cannot be interrupted: better-sqlite3 has no `interrupt`).
- After a successful `ddl` statement the schema snapshot cache of the connection is dropped (`invalidateSchema`, `schemaInvalidated: true`). Every statement that ran is inserted in `query_history` (`sql`, duration, rows or affected rows, `status`, `error`); a store failure never fails the query.
- Tests: `shared/sql-split.test.ts`, `server/query/raw-query-service.test.ts` (SQLite: results, truncation, guards, history, timeout and cancel), `server/query/dev-db-raw.test.ts` (Postgres and MySQL, `DBLOCAL_DEV_DB=1`: cancel `pg_sleep` / `SLEEP`, readonly, SET carry-over), `tests/integration/query-api.test.ts`.

## SQL editor (UI), saved queries, history, explain and export
- Page: `/c/:id/:schema/q/:qid` (`app/pages/c/[connectionId]/[schema]/q/[qid].vue`), a workspace tab of type `query`. Drafts (`sql`, `name`, `savedId`, `savedSql`) and the row limit / timeout live in `app/stores/queries.ts` (localStorage `dblocal-queries`, `dblocal-query-settings`); the layout's "New query" creates a draft and navigates. Reload or tab close never loses the text.
- Editor: `components/query/SqlEditor.vue` loads Monaco lazily on the client (`monaco-editor/editor/editor.main` and `editor.worker?worker`; the package's `./*` export maps to `esm/vs/*.js`). Theme is built from the CSS tokens (`--bg`, `--fg`, `--accent`, ...) and follows `data-theme`. ⌘Enter / ⌘⇧Enter / ⌘S / ⇧⌥F are Monaco commands. Format uses `sql-formatter`.
- Autocomplete is pure in `shared/sql-completion.ts` (`suggest`, `tablesInScope`): `alias.` columns, tables, keywords/functions per dialect, and after `JOIN` the join clauses derived from the relation graph (virtual ones included).
- Results use `components/query/ResultGrid.vue` over `DataGrid`, read-only. A plain `SELECT ... FROM table` (`sourceTableOf`, `shared/sql-source.ts`: no joins, grouping, subqueries or CTEs) gets the table's real column types, PK/FK badges, FK chips and, when the PK is in the result, relation chips; `select *` also adds the related-record count columns. Anything else keeps the type guessed from the driver type; one sub-tab per statement, status bar with duration/rows/"truncated"; prod writes open a confirm dialog and re-send with `confirmWrites`.
- Saved queries: `GET/POST /api/saved-queries`, `PATCH/DELETE /api/saved-queries/:id` (`server/query/saved-queries-service.ts`; `saved_queries` has `folder` since migration 003; `connection_id` null = available everywhere). History: `GET /api/history?q&connectionId&status&limit&offset`, `DELETE /api/history?connectionId`, `PUT /api/history/retention` (preference `history-retention`, default 5000; pruned to the newest N on every insert).
- Explain: `POST /api/c/:id/explain` `{ sql, schema, analyze }` → `{ plan: PlanNode | null, raw }` (`server/query/explain-service.ts`, parsers in `shared/explain.ts`). PG `EXPLAIN (FORMAT JSON)`, MySQL `EXPLAIN FORMAT=JSON` (analyze: text tree), SQLite `EXPLAIN QUERY PLAN`. One statement only; `analyze` runs it, so reads only and never on SQLite. Always a read-only session.
- Export: `POST /api/c/:id/export` `{ sql, schema, format, limit? }` streams one read statement (`QuerySession.stream`: pg-cursor / mysql2 stream / sqlite iterate, batches of 500, back-pressure through `sendExport`); `POST /api/c/:id/tables/:table/export` streams the grid view (filter, sort, scope, visible columns) by paging `readRows`. CSV has a BOM and CRLF (`shared/export-format.ts`); the result already on screen is exported client-side with the same formatter.
- Tests: `shared/sql-completion.test.ts`, `shared/explain.test.ts`, `shared/export-format.test.ts`, `server/query/saved-explain-export.test.ts`.
- Help: `content/help/{en,pt-BR}/sql-editor.md`.

## Turso (libSQL) connections
- A Turso database is a `sqlite` connection with a URL instead of a file: `host` holds `libsql://db-org.turso.io` (or `https://`, `wss://`), and the auth token is the encrypted `password` secret. `buildDriverConfig` and `createPlainDriver` pick the remote driver when `host` is set and `filePath` is not. No migration: the form's "Location" select sends `host`/`password` or `filePath` and clears the other (`null`, hence the nullable `host` and `filePath` in `shared/schemas/connection.ts`).
- Driver: `server/drivers/turso.ts` over `@libsql/client/web` (HTTP/WebSocket, no native module). Same SQL compilation and `introspectSqlite` as the file driver. Mutations use a write transaction. Raw SQL: read-only sessions send each statement in a read transaction (enforced by the server); there is no server-side cancel, `cancel` stops waiting; exports page through `select * from (<sql>) limit/offset`, so memory stays at one page. `parseConnectionString('sqlite', 'libsql://...?authToken=...')` splits the token out.
- Tests: `server/drivers/turso.test.ts` (URL, string, config, error mapping, unreachable host). Not exercised against a real Turso database.

## Schema diagram (ERD)
- Page: `/c/:id/:schema/erd` (`app/pages/c/[connectionId]/[schema]/erd.vue`), a workspace tab of type `erd`, one per schema (the layout's "Diagram" button reuses it). `?t=<table>&hops=<1-4>` is the neighbourhood filter, so a filtered view is a link. The canvas is client-only.
- Pure model in `shared/erd.ts` (`buildErd` turns `SchemaSnapshot` + `RelationGraph` into tables and column-to-column edges, N:N skipped; `neighbourhood`, `markerPath`, `edgeSides`, `usablePositions`); `shared/erd-svg.ts` draws the export. Tables over 40 columns keep keys first and show "+N more".
- Components in `app/components/erd/`: `ErdCanvas.vue` (Vue Flow, toolbar, search, hop filter, drag-to-create relation dialog, export), `ErdTableNode.vue` (node, one handle per column and side, `ConnectionMode.Loose`), `ErdEdge.vue` (smooth-step line plus crow's foot / bar markers; virtual = dashed accent), `layout.ts` (elkjs layered through `elk-api` + `elk-worker` in a Web Worker; 200 tables take about 0.3 s), `state.ts` (selection / hover / zoom state injected into nodes and edges so a hover never rebuilds them). Zoom below `ERD_COMPACT_ZOOM` (0.5) collapses nodes to their name.
- Layout persistence: `GET|PUT|DELETE /api/c/:id/erd-layout` (`?schema=`, body `{ schema, positions, replace? }`), stored in `preferences` under `erd-layout|connection|schema` (`server/erd/layout.ts`). Saved positions win table by table over the automatic layout; dragging saves (debounced, merged); "Reset layout" deletes them. Creating a relation calls `schemaStore.addVirtual`, so the grid and record panel pick it up.
- Export: PNG / SVG are built from the model (`buildErdSvg`), not from the DOM (html-to-image hung on the Vue Flow tree).
- Tests: `shared/erd.test.ts`, `server/erd/layout.test.ts`. Help: `content/help/{en,pt-BR}/erd.md`.
