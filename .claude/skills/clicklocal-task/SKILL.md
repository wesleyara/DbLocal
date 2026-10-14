---
name: clicklocal-task
description: Executa uma task rastreada no board ClickLocal "DbLocal mcp" (tools clicklocal_*). Use sempre que pedirem para implementar, continuar, checar ou fechar "a task N" ou "o card N". Garante que o card é lido antes de codar e que, ao concluir, é movido para a coluna certa e comentado com o que foi feito.
---

# Executar uma task via ClickLocal

Neste projeto, "task" sem mais contexto se refere a um **card do ClickLocal**.

## 0. Localizar o board

O board de trabalho é **"DbLocal mcp"**. Não assuma o ID: chame
`clicklocal_list_boards` e confirme pelo nome antes de listar cards. Depois use
`clicklocal_get_board` para conferir os IDs das colunas, que podem mudar.

| Coluna        | Uso                                             |
| ------------- | ----------------------------------------------- |
| `TO-DO`       | ainda não iniciado                              |
| `Bugs`        | defeitos reportados (sintoma, causa raiz)       |
| `In-progress` | em andamento: mover para cá ao começar          |
| `Testing`     | implementado, falta validar                     |
| `Done`        | concluído e verificado                          |

## 1. Ler o card

`clicklocal_get_card({ cardId })` com o ID citado. Se o pedido não trouxer ID,
liste (`clicklocal_list_cards`) e confirme com o usuário qual card.

Leia tudo: título, descrição, subtarefas e comentários (`clicklocal_list_comments`).
Se o escopo estiver solto, defina-o a partir da descrição e do código atual e
registre a decisão no comentário final, não em silêncio.

## 2. Começar

Mova o card para **In-progress** antes de tocar em código:
`clicklocal_update_card({ cardId, columnId: <id de In-progress> })`.

## 3. Implementar

Fique dentro do que o card pede e siga as convenções do projeto. Em card de bug,
investigue a causa raiz antes de corrigir.

## 4. Validar

Rode lint, typecheck e testes do projeto. Depois confira o que o card pede, item
por item, extraindo critérios verificáveis da descrição.

## 5. Fechar

1. **Sempre** mova o card para a coluna correta. Nunca deixe em In-progress:
   - tudo verificado de fato: **Done**;
   - implementado, mas com verificação pendente que este ambiente não consegue
     fazer: **Testing**. Não force Done.
2. **Sempre** comente no card (`clicklocal_add_comment`), inclusive quando a task
   para no meio por um bloqueio. O comentário cobre:
   - o que mudou e por quê (bug: sintoma, causa raiz, correção);
   - arquivos-chave tocados;
   - como foi validado;
   - decisões de escopo tomadas por conta própria;
   - pendências explícitas. Nunca finja que algo foi verificado sem ter sido.
3. Se surgir algo fora do escopo, mencione ao relatar ou crie um card novo
   (`clicklocal_create_card`) em `TO-DO` ou `Bugs`.

## Card bloqueado

Se o card depende de algo ainda não pronto, pare e diga qual é o bloqueio antes de
implementar pela metade. Registre-o num comentário e deixe o card na coluna em que
faz sentido, não em In-progress.
