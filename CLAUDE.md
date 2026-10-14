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
