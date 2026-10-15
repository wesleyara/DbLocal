---
title: Docker and the command line
description: Run DbLocal from the terminal or in a container, and reach databases on your machine.
category: Reference
order: 11
related: [security, troubleshooting]
---

# Docker and the command line

## The command line {#cli}

Build once, then start the server with the `dblocal` command:

```bash
pnpm build
node bin/dblocal.mjs
```

| Option | Effect |
| --- | --- |
| `--port <n>` | Port to listen on (default `5555`). |
| `--host <addr>` | Address to bind (default `127.0.0.1`). |
| `--data-dir <dir>` | Where `dblocal.db` and `secret.key` live. |
| `--readonly` | Makes every connection read-only. |
| `--no-open` | Does not open the browser. |
| `--version`, `--help` | Print the version or the usage. |

Give it a connection string, or the path of a SQLite file, and it saves the connection and opens straight into it:

```bash
node bin/dblocal.mjs postgres://user:password@localhost:5432/shop
node bin/dblocal.mjs ./app.sqlite
```

## Docker {#docker}

```bash
docker compose -f docker/compose.example.yml up -d --build
```

Then open `http://127.0.0.1:5555`. Your connections and keys live in the `/data` volume, so they survive a rebuild.

> [!WARNING]
> Inside the container DbLocal listens on all interfaces. Publish the port only to your own machine (`127.0.0.1:5555:5555`), or set `DBLOCAL_PASSWORD` before exposing it any further.

## Reaching databases on your machine {#host-databases}

From a container, `localhost` is the container itself. Use the host `host.docker.internal` (the example compose file maps it for Linux too), and make sure the database accepts connections from the Docker network. To open a SQLite file, mount it into the container and use its path inside the container.

## Environment variables {#environment}

| Variable | Effect |
| --- | --- |
| `DBLOCAL_PASSWORD` | Turns on the login page. Unset means no authentication. |
| `DBLOCAL_ALLOWED_HOSTS` | Extra host names (comma separated) accepted without a password. `localhost` and IP addresses are always accepted, so a web page cannot reach DbLocal through DNS rebinding. |
| `DBLOCAL_READONLY` | `1` makes every connection read-only. |
| `DBLOCAL_DATA_DIR` | Data directory (default `~/.dblocal`, `/data` in the container). |
| `DBLOCAL_SECRET` | Encryption key for saved secrets, instead of `secret.key`. |
| `DBLOCAL_HOST`, `DBLOCAL_PORT` | Address of the server. |
