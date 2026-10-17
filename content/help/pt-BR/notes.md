---
title: Notas
description: Guarde notas em Markdown sobre uma conexão e sobre cada tabela, salvas enquanto você digita.
category: Dados
order: 7
related: [data-grid, erd, schema-browser]
---

# Notas

O DbLocal guarda notas livres em Markdown junto dos seus dados: uma para cada conexão e uma para cada tabela. Use para o que o schema não diz: para que serve um banco, quem cuida dele, qual coluna está obsoleta, aquela query que você sempre precisa.

> [!NOTE]
> As notas ficam no armazenamento do próprio DbLocal (`dblocal.db` no data dir), nunca no seu banco. Quem se conecta ao banco não as vê.

## Notas da conexão {#connection-notes}

Clique em **Notas** na barra superior, ao lado de **Diagrama**. A nota abre numa aba própria do workspace, uma por conexão: a mesma nota em qualquer schema que você estiver navegando.

## Notas da tabela {#table-notes}

Numa tabela, abra as ferramentas extras da barra com **»** e clique em **Notas**. A nota pertence àquela tabela naquele schema. Um ponto em **Notas** (e no **»** enquanto as ferramentas estão escondidas) indica que a tabela tem uma.

## Escrevendo {#writing}

O editor é Markdown puro com uma barra para a formatação comum: negrito, itálico, títulos, listas, listas de tarefas, citações, links, imagens, tabelas, blocos de código e um **Bloco SQL**. **Diagrama** insere um bloco [mermaid](https://mermaid.js.org), desenhado na visualização (um `erDiagram` é um bom começo).

- **Editor** / **Visualizar** alternam entre escrever e ler.
- O botão de expandir abre a nota em tela cheia.
- Cada alteração é salva logo depois que você para de digitar; a linha acima do editor diz quando foi salva. Apagar todo o texto exclui a nota.

> [!TIP]
> Blocos de código marcados com `sql`, `postgres`, `mysql`, `json`, `bash`, `ts` ou `python` ganham destaque de sintaxe. Nada é carregado da internet: o editor funciona offline.
