---
title: Diagrama do schema (ERD)
description: Veja o schema como um diagrama de tabelas e relações, reposicione as tabelas e crie relações virtuais arrastando.
category: Dados
order: 6
related: [schema-browser, relationships]
---

# Diagrama do schema (ERD)

Clique em **Diagrama** na barra superior para abrir o schema como diagrama. Ele abre em uma aba própria do workspace, uma por schema.

![O diagrama do schema](/help/shots/erd-{theme}.png)

## Lendo o diagrama

- Cada caixa é uma tabela. As chaves vêm primeiro: o ícone de chave marca chaves primárias e o de elo marca chaves estrangeiras. Os tipos aparecem à direita. Um `?` depois do nome indica que a coluna aceita NULL, `U` marca índice único e `D` um valor default (passe o mouse na coluna para ver o default, a coluna referenciada e os índices únicos compostos).
- Uma linha liga a coluna que guarda a chave estrangeira à coluna para a qual ela aponta. A ponta mostra a cardinalidade: pé de galinha é "muitos", barra é "um". Um rótulo na linha diz a cardinalidade, lida do lado da chave estrangeira para a tabela referenciada: `N:1`, `1:1` ou `1:N`.
- **Linhas tracejadas azuis** são relações virtuais (declaradas no DbLocal, não no banco).
- Views têm contorno tracejado.
- Tabelas com mais de 40 colunas mostram as chaves e as primeiras colunas, depois "+N colunas".

## Navegar

- Role para dar zoom e arraste o fundo para mover. O minimapa e os controles no canto inferior esquerdo ajudam em schemas grandes.
- Com muito zoom out, as tabelas colapsam para só o nome, e um schema com centenas de tabelas continua legível.
- **Buscar tabela…** centraliza e destaca a tabela.

## Explorar uma tabela

- **Clique** numa tabela para destacá-la junto com os vizinhos diretos; o resto esmaece. Clique no fundo para limpar.
- **Passe o mouse** sobre uma linha para destacar as duas colunas que ela liga.
- **Duplo clique** numa tabela abre os dados dela numa aba.
- Com uma tabela selecionada, **Mostrar só as tabelas perto de X** mantém apenas as tabelas a até N relações dela (1 a 4 saltos). A escolha fica no endereço, então o link pode ser compartilhado.

## Layout {#layout}

O primeiro layout é calculado automaticamente. Arraste as tabelas para organizá-las; as posições são salvas por conexão e schema e voltam na próxima vez. **Resetar layout** volta ao automático.

## Notas {#notes}

Clique em **Adicionar nota** para colocar um comentário no meio da tela e digite; <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> ou um clique fora salva, <kbd>Esc</kbd> cancela. Clique duas vezes numa nota para editar, arraste para mover, arraste a borda direita para alargar ou estreitar e use o ícone de lixeira (ao passar o mouse) para excluir. Uma nota deixada vazia é removida.

As notas são salvas por conexão e schema, continuam visíveis com o filtro de tabela ligado e não são apagadas por **Resetar layout**. Elas entram na exportação PNG e SVG.

## Criar uma relação virtual

Arraste de uma coluna de uma tabela até uma coluna de outra. Escolha a cardinalidade, dê um nome se quiser e salve. A relação aparece no grid e no painel de registro como qualquer outra. O banco não é alterado.

## Exportar

**PNG** e **SVG** exportam o que está na tela (com o filtro aplicado) em tamanho cheio, com os rótulos de cardinalidade e as notas.
