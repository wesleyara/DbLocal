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

A barra no fim do grid mostra **N alterações pendentes**. **Ver SQL** mostra os comandos que vão rodar; os valores vão ao banco como parâmetros e aparecem inline só para leitura. **Salvar** (ou **Ctrl/⌘+S**) aplica o lote. Em uma conexão `prod`, você precisa digitar o nome da conexão antes.

Se o banco recusar algo, como uma chave duplicada, a linha responsável fica contornada em vermelho com a mensagem do banco, e todas as alterações pendentes são mantidas para você corrigir e salvar de novo. **Descartar** remove todas as pendências. Fechar uma aba com alterações pendentes pergunta antes.
