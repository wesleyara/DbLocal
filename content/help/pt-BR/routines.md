---
title: Funções e triggers
description: Veja, crie, edite e apague as funções, procedures e triggers guardadas no seu banco.
category: Dados
order: 8
related: [sql-editor, schema-browser, data-grid]
---

# Funções e triggers

O botão **Funções e triggers** na barra superior (ou <kbd>⌘</kbd><kbd>K</kbd> → *Abrir funções e triggers*) lista a lógica que vive no banco: funções, procedures e triggers do schema atual, com a definição completa.

## Encontrar {#finding}

A lista à esquerda agrupa por tipo. Filtre pelo tipo ou busque por nome ou tabela (um trigger é achado pela tabela a que pertence). Um trigger mostra a tabela, quando dispara (`BEFORE INSERT`, `AFTER UPDATE / DELETE`…) e se está desativado. O item selecionado fica na URL, então um link abre a mesma definição.

> [!NOTE]
> O SQLite não tem funções nem procedures armazenadas, só triggers. MySQL e Postgres têm os três. A tabela de um trigger está a um clique no cabeçalho do detalhe.

## Ler {#reading}

O lado direito mostra assinatura, linguagem, tipo de retorno, comentário e o `CREATE` completo num editor somente leitura. **Copiar** põe na área de transferência e **Abrir no editor SQL** começa uma nova consulta com ele.

## Criar, editar e apagar {#safety}

- **Nova função / procedure / trigger** abre um modelo para o seu banco. Para um trigger, escolha a tabela antes.
- **Editar** libera a definição. **Salvar** (ou <kbd>⌘</kbd><kbd>S</kbd>) mostra o SQL exato que vai rodar e pergunta antes.
- **Apagar** mostra o `DROP` e pergunta.
- Triggers do Postgres podem ser **desativados** e reativados sem apagar.

Tudo roda pelo endpoint de SQL, então valem as proteções de sempre: conexões somente leitura escondem essas ações, conexões `prod` pedem confirmação e cada comando entra no histórico.

> [!WARNING]
> O Postgres troca a função no lugar (`CREATE OR REPLACE`). Triggers, e tudo no MySQL e no SQLite, são removidos e criados de novo; o MySQL não desfaz DDL, então uma nova definição com erro deixa o objeto removido.
