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

### Snippets {#snippets}

Digite o começo de um comando (`create`, `alter table`, `insert`, …) e escolha um snippet: criar tabela, tabela com chave estrangeira, tabela de junção para N:N, índice, índice único, view, adicionar coluna, adicionar chave estrangeira, renomear ou remover coluna, insert, update, delete, upsert, CTE, transação (e `create type … as enum` no Postgres). Tab passa pelos campos; campos de tabela oferecem as tabelas do schema e `ON DELETE` oferece as ações. O SQL segue o dialeto (identity no Postgres, `AUTO_INCREMENT` no MySQL, `AUTOINCREMENT` no SQLite; no SQLite a chave estrangeira é adicionada como nova coluna com `REFERENCES`).

Depois de `alter table users ` os snippets já vêm com a tabela, e dentro de `create table … (` aparecem `id`, `timestamps`, `references` e um `fk → tabela` por tabela, com o tipo da chave dela.

### Sugestões do histórico {#history-suggestions}

Enquanto você digita, o resto da query mais recente desta conexão que começa igual (do histórico de execuções bem-sucedidas e das queries salvas) aparece em cinza, como no zsh-autosuggestions. <kbd>→</kbd> ou <kbd>Tab</kbd> aceita, <kbd>⌥→</kbd> pega uma palavra, continuar digitando ignora. Só aparece no fim da linha. Desligue nas configurações da query.

## Segurança {#safety}

- Em conexão somente leitura só leituras rodam; o banco também garante isso.
- Em conexão `prod`, um statement que escreve ou altera o schema pede confirmação antes.
- Depois de DDL, o schema da barra lateral é atualizado sozinho.

### Comandos destrutivos {#destructive}

`DROP`, `TRUNCATE`, `DELETE` ou `UPDATE` sem `WHERE` e `ALTER TABLE ... DROP` (coluna, chave ou constraint) sempre abrem a confirmação, qualquer que seja o **Alertar antes de rodar**, em qualquer conexão. Ela diz o que cada um destrói, e **Rodar** fica desligado até você digitar o nome da conexão (**Configurações → Segurança → Verificação dupla em ações pesadas**; desligada, fica só o aviso, exceto em escritas em `prod`). A mesma checagem vale para o editor de estrutura (remover tabela, remover coluna), para apagar uma função ou trigger e para a barra **Mostrar SQL** da tabela. O servidor recusa esses comandos sem a confirmação, então um script enviado por outro caminho não pula a checagem.

> [!WARNING]
> A checagem lê os comandos, não conhece seus dados: um `DELETE` com um `WHERE` que pega todas as linhas não é marcado. Faça backup antes de mudanças grandes.

### Alertar antes de executar {#alert-before-run}

Marque **Alertar antes de executar** (na barra do editor ou na barra **Ver SQL** da tabela; é uma configuração só para os dois) e toda execução lista antes os statements que vão rodar, cada um marcado como *leitura*, *escrita*, *schema* ou *desconhecido*, com o que ele faz. Nada roda até você confirmar. Em conexão `prod`, essa confirmação vale também como a de produção.

O SQL de uma visão de tabela (**Ver SQL**) é escrito com as palavras-chave em maiúsculas, como o autocomplete do editor.

## Queries salvas e histórico

⌘/Ctrl+S salva a query (pede um nome na primeira vez). O painel lateral tem **Salvas** (abrir, renomear, excluir, copiar, executar) e **Histórico**: cada execução com duração, linhas e status, com busca e filtro. Limpe quando quiser ou escolha quantas entradas manter. O mesmo histórico está em qualquer tabela: o botão **Histórico** ao lado de **Estrutura** o lista, filtrado pela tabela por padrão, e permite executar uma entrada de novo no editor.

## Explain e exportação

**Explain** desenha o plano como árvore com custo, linhas e, com **Explain analyze**, o tempo de cada nó; os nós mais pesados ficam destacados. *O analyze executa o statement* (só leituras, e não no SQLite).

**Exportar** salva o resultado atual em CSV ou JSON, ou reexecuta a query sem o limite e grava em arquivo por streaming. O grid de tabela tem a mesma exportação, respeitando os filtros, atrás do botão `«` à direita da barra.
