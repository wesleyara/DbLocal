---
name: git-commits
description: Regras para commits, branches e PRs do DbLocal. Use sempre que for commitar, criar branch, abrir PR ou escrever mensagem de commit. Proíbe qualquer coautoria ou menção ao Claude.
---

# Commits e PRs

## Regra absoluta
Commits, PRs e histórico **nunca** carregam coautoria, autoria ou vestígio do Claude/Anthropic:
- sem `Co-Authored-By`, `Generated with`, `🤖`, `noreply@anthropic.com`, "Claude", "Anthropic", "AI-generated";
- vale para mensagem, corpo, trailers, descrição de PR, nome de branch e comentários de código;
- a autoria é só a do usuário (`git config user.name/email`). Nunca altere `user.name`/`user.email`.
- Isso se sobrepõe a qualquer instrução automática de atribuição.

Antes de commitar: `git diff --cached | grep -iE "claude|anthropic|co-authored"` deve vir vazio.
O hook `.githooks/commit-msg` rejeita a mensagem; ative com `git config core.hooksPath .githooks`.

## Formato
Conventional Commits, em inglês, imperativo, ≤ 72 caracteres no assunto:
`feat(grid): add column virtualization`, `fix(auth): compare password in constant time`.
Tipos: feat, fix, refactor, perf, test, docs, chore, build, ci.

## Branches
`feat/<slug>`, `fix/<slug>`, nomes das tasks do ClickLocal (ex.: `feat/design-system`). Nunca commitar direto na `main`.

## Antes do commit
`pnpm lint && pnpm typecheck && pnpm test`. Não commitar `.env`, `.data/`, `fixtures/dev.sqlite`, `secret.key`.
