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
`DBLOCAL_DATA_DIR`, `DBLOCAL_SECRET`, `DBLOCAL_PASSWORD`, `DBLOCAL_HOST`, `DBLOCAL_PORT`.

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

