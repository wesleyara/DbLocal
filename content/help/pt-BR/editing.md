---
title: Editando dados
description: Altere células, adicione e exclua linhas, revise o SQL e salve tudo em uma única transação.
category: Dados
order: 4
related: [data-grid, relationships]
---

# Editando dados

As edições nunca são gravadas uma a uma. Cada mudança fica como *alteração pendente* até você apertar **Salvar**, e então todas são aplicadas em uma única transação: se um comando falhar, nada é gravado.

## O que pode ser editado

Tabelas com chave primária, ou com um índice único cujas colunas são todas `NOT NULL`, são editáveis. Views e tabelas sem essa chave são somente leitura, e o grid explica o motivo. Uma conexão marcada como somente leitura (ou um DbLocal iniciado com `DBLOCAL_READONLY=1`) esconde todos os controles de edição, e o servidor recusa escritas com `403`. Colunas geradas e auto-incremento não podem ser digitadas.

## Editando uma célula

Dê um duplo clique numa célula, ou selecione e aperte **Enter** ou **F2**. O editor segue o tipo da coluna: texto, número, seletores de data e hora, um select para enums e um alternador para booleanos (passa por *verdadeiro*, *falso* e *NULL*). Valores JSON e arrays abrem num diálogo que valida a sintaxe enquanto você digita. **Enter** confirma e desce, **Tab** confirma e avança, **Esc** cancela. Entradas inválidas, como texto numa coluna numérica, são recusadas com uma mensagem e nada muda.

Clique com o botão direito numa célula para **Definir NULL** ou **Definir DEFAULT**, desfazer aquela célula ou a linha inteira, duplicar ou excluir a linha. Uma célula de chave estrangeira abre um seletor que busca na tabela relacionada pela coluna de exibição, com uma prévia do registro.

Uma célula alterada fica destacada, e passar o mouse mostra o valor que ela tinha antes. Voltar a célula ao valor original remove a alteração.

## Adicionando e excluindo linhas

**Adicionar registro** coloca uma linha nova no topo do grid. Colunas que você não tocar usam o default do banco, mostrado como `DEFAULT`. No painel de registro, **Criar** numa relação *Has many* abre a tabela filha com uma linha nova cuja chave estrangeira já aponta para o registro.

A caixa de seleção da coluna da esquerda marca uma linha; a do cabeçalho marca todas as carregadas. Uma barra mostra quantas estão marcadas, com **Excluir selecionadas** (com a mesma checagem de impacto) e **Limpar**. O número da linha continua abrindo o registro.

Apertar **Delete** (ou *Excluir linha*) nas linhas selecionadas mostra antes o que depende delas: as relações um-para-muitos que apontam para as linhas, quantos registros cada uma tem e o que a chave estrangeira faz (`CASCADE` remove também, `RESTRICT` bloqueia a exclusão). As linhas ficam riscadas até você salvar.

## Salvando {#saving}

A barra no fim do grid mostra **N alterações pendentes**. **Ver SQL** mostra os comandos que vão rodar; os valores vão ao banco como parâmetros e aparecem inline só para leitura. **Salvar** (ou **Ctrl/⌘+S**) aplica o lote. Quando o lote exclui linhas (em qualquer conexão), ou numa conexão `prod`, um diálogo diz quantas linhas vão embora e pede o nome da conexão antes. Para exclusões isso segue **Configurações → Segurança → Verificação dupla em ações pesadas**.

Se o banco recusar algo, como uma chave duplicada, a linha responsável fica contornada em vermelho com a mensagem do banco, e todas as alterações pendentes são mantidas para você corrigir e salvar de novo. **Descartar** remove todas as pendências. Fechar uma aba com alterações pendentes pergunta antes.

## Importando um arquivo {#import}

**Importar** (atrás do botão `«` à direita da barra, ao lado de Exportar) lê um arquivo CSV ou JSON para a tabela. O CSV precisa de uma linha de cabeçalho; o separador (vírgula, ponto e vírgula, tab ou barra vertical) é detectado e pode ser trocado. O JSON é uma lista de objetos, ou um objeto por linha, como o DbLocal exporta.

As colunas do arquivo são ligadas às da tabela pelo nome (sem diferenciar maiúsculas, espaços, `_` e `-`); troque qualquer ligação ou marque *Não importar*. Colunas calculadas e binárias não podem ser preenchidas; colunas identity e auto-increment podem, então o arquivo mantém seus ids. Cada célula é verificada como um valor digitado no grid: números, datas (`AAAA-MM-DD`), booleanos (`true`/`false`, `1`/`0`, `sim`/`não`), JSON e UUIDs. Um texto como `now()` é gravado como está. Com **Células vazias são NULL**, uma célula vazia vira NULL, ou o default da coluna quando ela é NOT NULL e tem um.

- **Inserir novas linhas** adiciona todos os registros. Uma chave que já existe falha.
- **Inserir ou atualizar** usa a chave da tabela (a chave primária, ou um índice único NOT NULL): um registro cuja chave existe atualiza essa linha, os outros são inseridos. As colunas da chave precisam estar mapeadas. No MySQL, qualquer índice único que coincida também conta como linha existente. Como sobrescreve linhas, o upsert mostra um aviso e pede o nome da conexão antes de rodar.

Registros inválidos são listados antes de qualquer coisa rodar; corrija o arquivo ou marque **Pular registros inválidos**. Depois os registros são enviados em lotes de 1000: todos os lotes são verificados pelo servidor primeiro, e nada é gravado se um falhar. Cada lote é então gravado em uma transação própria, então uma falha durante a gravação (chave duplicada, chave estrangeira) mantém os lotes já gravados e informa quantos. Em uma conexão `prod` você digita o nome da conexão antes; uma conexão somente leitura não oferece importação.

> [!NOTE]
> No Postgres, importar ids numa coluna `serial` ou identity não avança a sequence. Rode `SELECT setval(pg_get_serial_sequence('tabela', 'id'), max(id)) FROM tabela` depois, ou as novas linhas vão colidir com as importadas.
