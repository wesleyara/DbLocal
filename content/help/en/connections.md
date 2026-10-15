---
title: Connections
description: Save Postgres, MySQL and SQLite connections, test them and connect through an SSH tunnel.
category: Getting started
order: 1
related: []
---

# Connections

A connection is a saved way to reach a database: the host, the credentials and, if needed, SSL and an SSH tunnel. DbLocal stores them on this machine only.

## Add a connection {#add-a-connection}

1. Click **New connection**.
2. Choose the dialect, then either fill the fields or paste a connection string such as `postgres://user:password@host:5432/database`. The fields fill from the string when you leave the field.
3. Click **Test connection**. A successful test shows the server version and the latency.
4. Click **Save**.

## Passwords and secrets

Passwords, SSL certificates and SSH keys are encrypted before they are stored. They are never shown again: a saved field shows "Stored", and leaving it blank keeps the stored value.

## SSL {#ssl}

Pick an SSL mode in the **SSL** tab:

- **Disabled**: no encryption.
- **Require**: encrypts the traffic but does not check the server certificate.
- **Verify CA**: checks the certificate against the CA you paste.
- **Verify CA and host name**: the strictest mode; also checks that the certificate matches the host.

## SSH tunnel {#ssh-tunnel}

Turn on **Connect through an SSH tunnel** in the **SSH** tab to reach a database that is only visible from a bastion host. DbLocal opens the tunnel when it connects and reopens it if the SSH session drops.

## Environment and read-only {#environment-and-read-only}

In **Advanced**, mark a connection as `staging` or `prod` to get a coloured strip at the top of the workspace. Turn on **Read-only** to block every write from DbLocal to that connection.

## Choose a schema

When you open a connection, the sidebar lists its schemas (Postgres) or databases (MySQL and SQLite). System schemas stay hidden until you turn on **Show system schemas**. The schema you pick is remembered for the connection.

## Turso (libSQL)

Choose **SQLite / Turso**, set *Location* to **Turso (remote)** and enter the database URL (`libsql://my-db-org.turso.io`) and an auth token, or paste `libsql://...?authToken=...` in the connection string field. The token is stored encrypted and never shown again. A running statement cannot be cancelled on the server: *Cancel* only stops waiting for it.
