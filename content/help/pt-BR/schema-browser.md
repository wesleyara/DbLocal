---
title: Navegador de schema e relações virtuais
description: Navegue pelas tabelas de um schema, veja como elas se relacionam e declare relações que não têm chave estrangeira no banco.
category: Primeiros passos
order: 2
related: [connections]
---

# Navegador de schema e relações virtuais

A barra lateral lista as tabelas e views do schema em que você está. Cada tabela mostra a contagem estimada de linhas. Expanda uma tabela para ver suas colunas e relações.

## Navegar pelas tabelas

- **Filtro**: digite parte do nome. As letras precisam aparecer na mesma ordem, então `ped` encontra `pedidos`.
- **Abrir uma tabela**: clique nela, ou selecione com as setas do teclado e pressione Enter. A tabela abre com colunas e relações, e o endereço guarda a tabela, então você pode salvar o link.
- **Expandir ou recolher**: clique na seta, ou use as setas direita e esquerda.
- **Teclado**: as setas para cima e para baixo movem entre tabelas, Home e End vão para a primeira e a última.

## Relações

Uma relação liga duas tabelas. A barra lateral mostra o nome pelo qual você navega, por exemplo `orders.user` de `orders` para `users`, e o inverso `users.orders`.

- Uma relação com chave estrangeira no banco é uma relação normal.
- Uma **relação virtual** é uma que você declara. Ela tem contorno tracejado e um ponto na barra lateral.

## Adicionar uma relação virtual {#add-a-virtual-relation}

1. Clique no botão de **link** no topo da barra lateral.
2. Escolha a tabela e a coluna de cada lado, e a cardinalidade.
3. Opcionalmente dê um nome.
4. Clique em **Salvar relação**.

O DbLocal confere a relação antes de salvar. Ele recusa tabela ou coluna que não existe, colunas de tipos incompatíveis e uma relação que já existe.

Edite ou exclua uma relação virtual pelo mesmo diálogo.

## Coluna de exibição {#display-column}

Cada tabela tem uma coluna que representa um dos seus registros, como `name` ou `title`. O DbLocal escolhe uma para você. Para escolher outra, abra o menu da tabela e selecione **Definir coluna de exibição**. Escolha **Automática** para voltar ao padrão.

## Atualizar o schema

O DbLocal guarda o schema em memória para a navegação ser rápida. Depois de mudar o banco fora do DbLocal, clique em **Atualizar schema** na barra lateral.

## Editando a estrutura {#editing-the-structure}

**Structure** (na barra do grid) mostra as colunas, relações e triggers de uma tabela. Numa tabela de uma conexão que não é somente leitura, **Editar estrutura** vira um formulário:

- **Colunas**: renomear, trocar o tipo (sugestões por banco, qualquer tipo pode ser digitado), NULL e o default, adicionar ou remover. O default é uma expressão SQL: `'texto'` com aspas, `0`, `now()`. A chave primária e as colunas identity ficam como estão.
- **Índices** e **chaves estrangeiras**: remover um existente ou adicionar um novo (colunas, único; tabela e coluna de destino, `ON DELETE` / `ON UPDATE`).
- **Nome da tabela**, e **Excluir tabela**.

**Revisar e rodar** monta o DDL e mostra na confirmação antes de enviar qualquer coisa; ele passa pelo endpoint do editor SQL, então somente leitura, `prod` e histórico valem. Postgres e SQLite rodam o script em uma transação. O MySQL confirma cada comando sozinho, então uma falha no meio deixa os anteriores aplicados, e alterar uma coluna a reescreve inteira (`MODIFY`, mantendo auto-increment, `ON UPDATE` e o comentário).

O `ALTER TABLE` do SQLite só renomeia e adiciona ou remove colunas simples. Para o resto (tipo, NULL ou default, chave estrangeira, uma restrição única escrita no `CREATE TABLE`) a tabela é recriada: uma tabela nova, as linhas copiadas, a antiga removida e a nova renomeada, com seus índices e triggers criados de novo, em uma transação. Tabelas com colunas geradas não podem ser recriadas assim.

**Nova tabela** (o botão `+` na barra lateral, ou ⌘K) abre o mesmo formulário para uma tabela nova, começando com uma chave primária `id` auto-incremento.

> [!WARNING]
> Trocar o tipo de uma coluna numa tabela grande a reescreve e pode travá-la por um tempo. Valores que não convertem fazem o comando falhar.
