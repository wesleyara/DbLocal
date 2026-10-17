---
title: Editor SQL
description: Escreva e execute queries, guarde as que reutiliza, consulte o histórico, veja planos e exporte resultados.
category: Dados
order: 5
related: [data-grid, editing]
---

# Editor SQL

**Nova query** na barra superior abre uma aba de editor ligada à conexão e ao schema atuais. O texto é guardado enquanto você digita, então recarregar a página não perde nada.

![O editor SQL com um resultado](/help/shots/sql-editor-{theme}.png)

## Executando {#running}

- **⌘/Ctrl+Enter** executa a seleção, ou o statement sob o cursor.
- **⌘/Ctrl+Shift+Enter** executa o script inteiro. Cada statement ganha uma aba de resultado; se um falha, o script para e os demais aparecem como ignorados.
- **Cancelar** interrompe o statement no servidor (`pg_cancel_backend`, `KILL QUERY`; no SQLite para entre as linhas).
- O resultado mostra no máximo o **limite de linhas** (1000 por padrão) e avisa *Resultado truncado* quando havia mais. O limite e o timeout de 30 s ficam no botão de configurações.

## Autocomplete e formatação

Tabelas, colunas (depois de `alias.`), funções e palavras-chave são sugeridas para o seu dialeto. Depois de `JOIN`, o editor oferece os joins que suas relações descrevem, inclusive as virtuais. **Formatar** (⇧⌥F) organiza o script.

## Segurança {#safety}

- Em conexão somente leitura só leituras rodam; o banco também garante isso.
- Em conexão `prod`, um statement que escreve ou altera o schema pede confirmação antes.
- Depois de DDL, o schema da barra lateral é atualizado sozinho.

### Alertar antes de executar {#alert-before-run}

Marque **Alertar antes de executar** (na barra do editor ou na barra **Ver SQL** da tabela; é uma configuração só para os dois) e toda execução lista antes os statements que vão rodar, cada um marcado como *leitura*, *escrita*, *schema* ou *desconhecido*, com o que ele faz. Nada roda até você confirmar. Em conexão `prod`, essa confirmação vale também como a de produção.

O SQL de uma visão de tabela (**Ver SQL**) é escrito com as palavras-chave em maiúsculas, como o autocomplete do editor.

## Queries salvas e histórico

⌘/Ctrl+S salva a query (pede um nome na primeira vez). O painel lateral tem **Salvas** (abrir, renomear, excluir, copiar, executar) e **Histórico**: cada execução com duração, linhas e status, com busca e filtro. Limpe quando quiser ou escolha quantas entradas manter. O mesmo histórico está em qualquer tabela: o botão **Histórico** ao lado de **Estrutura** o lista, filtrado pela tabela por padrão, e permite executar uma entrada de novo no editor.

## Explain e exportação

**Explain** desenha o plano como árvore com custo, linhas e, com **Explain analyze**, o tempo de cada nó; os nós mais pesados ficam destacados. *O analyze executa o statement* (só leituras, e não no SQLite).

**Exportar** salva o resultado atual em CSV ou JSON, ou reexecuta a query sem o limite e grava em arquivo por streaming. O grid de tabela tem a mesma exportação, respeitando os filtros.
