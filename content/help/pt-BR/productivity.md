---
title: Paleta de comandos, atalhos e busca
description: Chegue a qualquer lugar pelo teclado, veja todos os atalhos e encontre um valor em qualquer tabela.
category: Produtividade
order: 8
related: [data-grid, sql-editor]
---

# Paleta de comandos, atalhos e busca

## Paleta de comandos

Tecle **⌘/Ctrl+K** (ou clique no campo de busca da barra superior) e digite.

- Tabelas, queries salvas, outras conexões, abas recentes e ações são buscadas juntas; a busca é aproximada, então `ordit` encontra `order_items`.
- `>` limita a lista às **ações**: nova query, abrir o diagrama, atualizar o schema, trocar tema ou idioma, sair.
- `#users 42` vai direto ao **registro 42 de `users`**. Digite `#users` primeiro para escolher a tabela e depois a chave primária. Tabelas com chave composta abrem a tabela.
- Com o campo vazio, as abas recentes vêm primeiro. Setas movem, **Enter** abre, **Esc** fecha.

## Atalhos de teclado

Tecle **?** em qualquer lugar (fora de um campo) para abrir o guia. Ele lista todos os atalhos por contexto, com ⌘ no macOS e Ctrl nos demais. Os atalhos não disparam enquanto você digita em um campo ou no editor, exceto **⌘/Ctrl+K**, **⌘/Ctrl+S**, **⌘/Ctrl+Enter** e **⌘/Ctrl+Shift+F**.

| Contexto | Teclas |
| --- | --- |
| Em todo lugar | **⌘K** paleta, **⌘⇧F** buscar dados, **?** guia, **⌘S** salvar |
| Abas | **⌘[** / **⌘]** histórico, **⌘⇧[** / **⌘⇧]** aba anterior / próxima, **⌘T** nova query, **⌘W** fechar, **⌘B** sidebar, **⌘R** recarregar dados |
| Grid | setas, **Home/End**, **PgUp/PgDn**, **Enter** editar, **Espaço** abrir registro, **⌘C** copiar, **Del** marcar exclusão, **⌘Z** desfazer as edições pendentes da linha, **F** filtrar pela célula |

## Buscando nos dados

**⌘/Ctrl+Shift+F** (ou *Buscar dados no schema* na paleta) procura um valor em todas as tabelas do schema atual.

- **Contém** é uma busca por trecho, sem diferenciar maiúsculas, em colunas de texto; **Exato** compara o valor inteiro, inclusive em colunas enum, uuid e numéricas.
- Números só são comparados com termos numéricos, e colunas uuid só com um uuid completo.
- A busca roda sob demanda, quatro tabelas por vez, e guarda no máximo 10 linhas por tabela. Os resultados aparecem conforme cada tabela responde.
- **Cancelar** (ou fechar o diálogo) interrompe as tabelas que ainda não começaram.
- Clique numa linha para abrir o registro, ou em **Abrir tabela filtrada** para ver todos os resultados no grid.
