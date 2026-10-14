---
name: db-migration
description: Adiciona migration ao store interno SQLite do DbLocal (dblocal.db) ou altera suas tabelas. Use ao criar/alterar tabelas de conexões, queries salvas, histórico, relações virtuais, preferências.
---

# Migrations do store interno

1. Novo arquivo em `server/store/migrations/NNN_nome.ts` exportando `up(db)` e `down(db)` (Kysely). Nunca edite uma migration já aplicada.
2. Registre em `server/store/db.ts` no `provider.getMigrations()` (ordem pelo prefixo).
3. Atualize a interface `StoreSchema` em `server/store/db.ts`.
4. Segredos (senha, passphrase, chave SSH) só via `encryptSecret`/`decryptSecret` (`server/utils/secrets.ts`); nunca em claro e nunca devolvidos ao cliente (exponha `hasPassword: true`).
5. Teste em `server/store/*.test.ts` usando data dir temporário (`mkdtempSync`).
6. Não confundir com bancos de usuário: estes só passam pela interface `Driver`.
