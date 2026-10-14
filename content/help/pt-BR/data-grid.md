---
title: Navegar nos dados
description: Leia uma tabela no grid, filtre, ordene e pagine as linhas, e compartilhe uma visão pelo link.
category: Dados
order: 2
related: [schema-browser]
---

# Navegar nos dados

Abra uma tabela na barra lateral para ver as linhas no grid. O grid lê uma página por vez, então tabelas grandes continuam rápidas.

## Ordenar

Clique no cabeçalho de uma coluna para ordenar em ordem crescente, clique de novo para decrescente e um terceiro clique remove a ordenação. Segure **Shift** para adicionar uma coluna à ordenação sem perder as outras.

## Colunas

Arraste um cabeçalho sobre outro para mover a coluna. Passe o mouse sobre um cabeçalho e clique no ícone de pino para mantê-la à esquerda ao rolar para os lados. O menu **Colunas** oculta ou mostra colunas, e **Restaurar colunas e larguras** volta tudo ao padrão. Arraste a borda direita de um cabeçalho para redimensioná-lo. Essas escolhas são salvas para cada tabela.

## Chips de ordenação

A barra de ordenação acima do grid lista cada ordenação. Clique num chip para inverter a direção, arraste para mudar a ordem, ou use o **×** para remover.

## Filtrar


Clique em **Filtro** para adicionar uma condição. **Filtros avançados** abre uma árvore para combinar condições com E e OU, aninhadas em até três níveis: escolha a coluna, o operador e o valor. Cada condição vira um chip. Clique no chip para editá-lo, ou use o **×** para removê-lo. **Limpar tudo** remove todas as condições.

Os operadores oferecidos dependem do tipo da coluna:

- **Números e datas**: é, não é, maior ou menor que, entre, é um de.
- **Texto**: contém (sem diferenciar maiúsculas), começa com, termina com, é, não é.
- **Booleanos**: é verdadeiro, é falso.
- **Qualquer coluna**: é NULL e não é NULL.

Use a vírgula para digitar vários valores em "é um de". `NULL` e texto vazio são coisas diferentes: um NULL aparece como o selo cinza **NULL**.

## Valores

Clique duas vezes numa célula para ver o valor completo. JSON abre como árvore que pode ser recolhida. Valores binários podem ser baixados como estão armazenados. O diálogo também tem **Filtrar por este valor**.

## Páginas e contagens

Escolha quantas linhas cada página mostra (50, 100, 250 ou 500). O rodapé mostra o intervalo e o total. Em tabelas muito grandes o total é uma estimativa, marcada com `~`. Clique em **Contar exatamente** para contar o número real de linhas.

## Compartilhar uma visão

Ordenação, filtros e a página fazem parte do endereço no navegador. Copie o link para abrir a mesma visão de novo.

## Tabelas sem chave primária

Uma tabela sem chave primária pode ser lida, filtrada e ordenada, mas as linhas são somente leitura. O grid mostra um aviso quando isso acontece.
