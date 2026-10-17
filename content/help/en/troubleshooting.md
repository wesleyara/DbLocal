---
title: Troubleshooting
description: The usual reasons a connection or a query fails, and what to try.
category: Reference
order: 13
related: [connections, docker-cli]
---

# Troubleshooting

When something fails, DbLocal shows a short message and keeps the technical detail one click away. Most problems fall into one of these.

## The connection test fails {#connection}

| Message | What to check |
| --- | --- |
| Authentication failed | User and password. For Postgres also the database name: it is part of the login. |
| Cannot reach the server | Host and port, and whether the server is running. In Docker use `host.docker.internal`, not `localhost`. |
| Timed out | A firewall or the wrong address. Over SSH, check the tunnel settings first. |
| SSL required / certificate | Pick the SSL mode the server expects; `require` encrypts without checking the certificate. |
| File not found (SQLite) | The path must exist where DbLocal runs. In Docker, mount the file and use the path inside the container. |

## The database went offline {#offline}

If a database stops answering while you work (server stopped, network down, VPN off), the table or diagram you open shows **Could not connect** with the reason, inside DbLocal: the sidebar, the tabs and your other connections keep working. Start the database again and click **Try again**, or go **Back to connections**.

## SSH tunnel {#ssh}

The host and port of the database are the ones **seen from the SSH server**, not from your machine. If the session drops, the next action reconnects it by itself.

## A table looks stale {#stale}

DbLocal caches the schema. After changing it outside DbLocal, use **Refresh schema** (sidebar or command palette). Running DDL in the SQL editor refreshes it for you.

## I cannot edit a table {#read-only}

Rows are editable only when the table has a primary key (or a unique index on non-null columns). Views and tables without one are read-only. A read-only connection, or `--readonly`, turns editing off everywhere.

## A query is cancelled {#timeout}

Statements stop at the timeout (30 seconds by default) and results at the row limit (1,000). Both are in the editor's settings.

## Too many sign-in attempts {#login}

Sign-in is limited to five attempts per minute per address. Wait a minute and try again.
