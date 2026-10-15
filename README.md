# DbLocal

A local database browser for **PostgreSQL**, **MySQL** and **SQLite** (and Turso/libSQL), in the spirit of
Prisma Studio: relations are explicit and navigable, connections are saved, and there is a SQL editor.

![Data grid with foreign-key chips and relation counts](docs/screenshots/grid.png)

## Features

- **Relations you can follow.** Foreign keys show up as chips with the related record's name; reverse
  (1:N) and many-to-many relations are count columns that open the child table filtered. A record side panel,
  tabs, history, breadcrumbs and deep links keep every view reproducible from its URL.
- **Virtual relations** for databases without foreign keys.
- **Data grid.** Virtualised, with an AND/OR filter builder, sorting, paging, per-type renderers, column
  pinning/hiding, exact or estimated counts, CSV/JSON export.
- **Safe editing.** Edits stay pending and highlighted until you save; everything is applied in one
  transaction, with a SQL preview, delete-impact for `ON DELETE` actions, and typed confirmation on `prod` connections.
- **SQL editor.** Monaco with schema-aware autocomplete, multi-statement results, cancel and timeouts,
  saved queries, history, `EXPLAIN` and streaming export.
- **Schema diagram (ERD)** with auto-layout, crow's-foot cardinality, neighbourhood filter and PNG/SVG export.
- **Productivity.** Command palette (`⌘K`), shortcuts everywhere (`?` lists them), global data search (`⌘⇧F`).
- **Connections.** SSL/TLS modes, SSH tunnel, environments (`local`/`staging`/`prod`), read-only mode.
  Secrets are encrypted at rest (AES-256-GCM) and never sent back to the browser.
- English and Brazilian Portuguese, dark and light themes.

|                                                  |                                         |
| ------------------------------------------------ | --------------------------------------- |
| ![Record panel](docs/screenshots/record.png)     | ![ERD](docs/screenshots/erd.png)        |

## Install

DbLocal is not published to npm or a container registry: clone the repository and run it from there.

```bash
git clone git@github.com:wesleyara/DbLocal.git && cd DbLocal
```

### Node (Node 22 or newer, pnpm)

```bash
pnpm install
pnpm build
node bin/dblocal.mjs                                   # opens http://127.0.0.1:5555
node bin/dblocal.mjs postgres://user:pass@localhost:5432/mydb   # opens straight into the connection
node bin/dblocal.mjs ./app.sqlite --readonly
```

Options: `-p, --port`, `--host`, `--data-dir`, `--readonly`, `--no-open`, `-v, --version`, `-h, --help`.
`pnpm dev` runs the development server instead (`pnpm db:up && pnpm db:seed` gives Postgres, MySQL and SQLite sample data).

### Docker

```bash
DBLOCAL_PASSWORD=change-me docker compose -f docker/compose.example.yml up -d --build
```

Then open http://127.0.0.1:5555. See the compose file for mounting SQLite files.

- Data (saved connections, queries, the encryption key) lives in the `dblocal-data` volume mounted at `/data`.
- To reach a database running on your machine, use the host `host.docker.internal`. The database must accept
  connections from the Docker bridge (not only `127.0.0.1`).
- The image runs as the non-root `node` user and has a `/api/health` healthcheck.

## Configuration

| Variable | Meaning |
| --- | --- |
| `DBLOCAL_PASSWORD` | Enables the login page. Unset means no authentication. |
| `DBLOCAL_READONLY` | `1` makes every connection read-only (`--readonly` sets it). |
| `DBLOCAL_DATA_DIR` | Where `dblocal.db` and `secret.key` live. Default `~/.dblocal`, `/data` in the container. |
| `DBLOCAL_SECRET` | Encryption key for saved secrets, instead of `<data dir>/secret.key`. |
| `DBLOCAL_HOST`, `DBLOCAL_PORT` | Address of the dev server and of the CLI. Default `127.0.0.1:5555`. |
| `NITRO_HOST`, `NITRO_PORT` | The same for the built server (`node .output/server/index.mjs`). |

## Security

DbLocal gives whoever can open it full access to every saved connection. Treat it like a database client on
your machine, not like a service.

- It binds to `127.0.0.1` by default. Binding anywhere else without `DBLOCAL_PASSWORD` shows a warning in the app.
- In Docker the server binds to `0.0.0.0` inside the container so the published port works. Publish it on
  `127.0.0.1:5555:5555` and set `DBLOCAL_PASSWORD`; do not expose it to a network without a password and TLS.
- With a password: signed `httpOnly`, `SameSite=Strict` session cookie, login rate limit (5 per minute per IP),
  pages redirect to `/login` and `/api/**` answers 401.
- Mutating requests whose `Origin` differs from the host are refused (CSRF).
- Saved passwords, SSH keys and passphrases are encrypted with AES-256-GCM. Back up `secret.key` (or keep
  `DBLOCAL_SECRET`) together with `dblocal.db`: one is useless without the other.
- Use `--readonly` / `DBLOCAL_READONLY` when you only need to look. Read-only is also enforced by the database
  session (read-only transactions), not only by the UI.

## Development

`pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:integration` · `pnpm test:e2e`
(`E2E_BUILT=1 pnpm test:e2e` after `pnpm build` runs the production build and the login flow;
`E2E_DIALECTS=sqlite` limits the dialect suite). See [CLAUDE.md](CLAUDE.md) for the architecture.

## Releasing

Releases are cut locally, from `develop`, and published by merging into `main`.

1. Nothing to write by hand: the changelog is generated from the Conventional Commits since the last tag
   (`feat` → Added, `fix` → Fixed, `perf` → Performance, `refactor` → Changed, `!` → Breaking changes;
   docs, test, build, ci and chore are left out). Anything already under `## [Unreleased]` is kept on top.
2. On `develop`, clean and in sync with `origin/develop`, run one of:

   ```bash
   pnpm release:patch    # 0.1.0 -> 0.1.1
   pnpm release:minor    # 0.1.0 -> 0.2.0
   pnpm release:major    # 0.1.0 -> 1.0.0
   ```

   Add `--dry-run` to see the plan without changing anything. The script bumps `package.json`, writes the
   new section to `CHANGELOG.md`, commits `chore(release): vX.Y.Z`, creates the annotated tag and
   pushes `develop` and the tag.
3. Open a PR `develop` → `main` and merge it. `.github/workflows/release.yml` then creates the GitHub release
   for that tag, with the changelog section as its notes.

Nothing is published to npm or a container registry.

## License

[MIT](LICENSE)
