---
title: Primeiros passos
description: O que é o DbLocal, como abrir seu primeiro banco e para onde ir depois.
category: Primeiros passos
order: 0
related: [connections, relationships]
---

# Primeiros passos

O DbLocal é um navegador de bancos de dados que roda na sua máquina. Ele lê **Postgres**, **MySQL** e **SQLite**, mostra cada chave estrangeira como algo clicável e mantém seus dados onde estão: nada sai do seu computador.

## Abrir um banco

1. Na página inicial, clique em **Nova conexão** e preencha o host, ou cole uma connection string.
2. Clique em **Testar conexão** e depois em **Salvar**.
3. Abra a conexão e escolha um schema. As tabelas aparecem na barra lateral.

> [!TIP]
> Quer explorar antes? Use **Experimentar o banco de demonstração** na página inicial. É uma pequena loja (usuários, pedidos, produtos) que você pode editar à vontade e resetar quando quiser.

## Seguir as relações

Abra uma tabela e procure os chips nas colunas de chave estrangeira e as colunas de contagem no fim do grid. Clique num chip para abrir o registro relacionado, ou numa contagem para abrir as linhas relacionadas. A trilha no topo mostra de onde você veio.

## Alterar dados com segurança

As edições ficam como alterações pendentes até você salvar. **Preview SQL** mostra exatamente o que vai rodar, e um salvamento que falha não altera nada.

## Encontrar o caminho

- Pressione <kbd>F1</kbd> ou clique em **?** na barra superior para abrir esta ajuda de qualquer lugar.
- Pressione <kbd>Ctrl</kbd> + <kbd>K</kbd> (<kbd>⌘</kbd> + <kbd>K</kbd> no macOS) para a paleta de comandos.
- Pressione <kbd>?</kbd> para ver os atalhos de teclado.

## Para onde ir depois

- [Conexões](connections) cobre SSL, túneis SSH, ambientes e somente leitura.
- [Navegando pelas relações](relationships) explica chips, contagens e o painel de registro.
- [Editor SQL](sql-editor) serve para consultas que vão além do grid.
