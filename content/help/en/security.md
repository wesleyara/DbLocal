---
title: Security
description: What DbLocal protects, what it does not, and how to use it safely.
category: Reference
order: 12
related: [docker-cli, connections]
---

# Security

DbLocal is a tool for your own machine. These are the choices that keep it that way.

## Local by default {#local}

It binds to `127.0.0.1`, so only your computer can reach it. Binding anywhere else without a password shows a warning in the app.

## Password {#password}

Set `DBLOCAL_PASSWORD` to require a sign-in. The session is an httpOnly cookie, sign-in attempts are limited (five per minute per address) and requests from another origin are refused.

> [!DANGER]
> Anyone who can open DbLocal can use every saved connection. If you expose it beyond your machine, set a password and put it behind TLS.

## Secrets {#secrets}

Passwords, SSL certificates and SSH keys are encrypted with AES-256-GCM before they are stored, and the API never sends them back. The key is generated on first run in `<data dir>/secret.key` (mode 600) or comes from `DBLOCAL_SECRET`. Back it up together with `dblocal.db`: one is useless without the other.

## Read-only and production {#read-only}

- Mark a connection **read-only**, or start with `--readonly`: writes are refused by DbLocal and by the database session itself.
- Mark a connection `prod`: saving changes asks you to type the connection name, and write or DDL statements in the SQL editor ask for confirmation.

## Demo and tour {#demo}

The demo database is a separate SQLite file in the data directory. The tour only ever runs on it, and **Reset demo** restores it. Neither touches your own databases.
