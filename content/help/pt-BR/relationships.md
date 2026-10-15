---
title: Navegar pelos relacionamentos
description: Siga chaves estrangeiras e registros relacionados de linha em linha, com abas, trilha e links.
category: Dados
order: 3
related: [data-grid, schema-browser]
---

# Navegar pelos relacionamentos

O DbLocal lê as relações do seu schema (chaves estrangeiras, tabelas de junção e as relações virtuais que você declara) e as transforma em algo clicável.

## Pais: chips de chave estrangeira

Uma célula de chave estrangeira mostra o registro relacionado como um chip, por exemplo `#42 · Ana Souza`. O texto depois do ponto é a coluna de exibição da tabela. Passe o mouse no chip para ver uma prévia do registro, clique para abrir o registro no painel lateral e use **Ctrl/⌘+clique** para abrir em uma nova aba. Um chip em cor de aviso é órfão: o valor aponta para um registro que não existe, o que é comum em relações virtuais.

## Filhos: colunas de relação

No fim do grid, cada relação um-para-muitos e muitos-para-muitos tem uma coluna com o número de registros relacionados, como `12 orders`. Clique para abrir a tabela relacionada filtrada por aquele registro. Um *chip de relação* tracejado acima do grid, como `orders de users #42`, indica que o filtro veio da navegação. Remova-o com o **x** para ver a tabela inteira. Mostre ou esconda essas colunas no menu **Colunas**.

As contagens são carregadas só para as linhas na tela, em uma requisição por relação, então não pesam no grid.

## O painel de registro

Clique no número da linha (ou aperte **Espaço** numa célula selecionada) para abrir o registro completo. O painel mostra todos os campos, os pais a que ele pertence e as relações que ele possui, com a contagem e os cinco primeiros registros de cada uma. Clique em qualquer um para seguir sem fechar o painel, e use a seta do cabeçalho para voltar. Dá para copiar o registro como JSON ou como um `INSERT`.

## Abas, trilha e links

Cada aba do workspace tem seu próprio histórico. Use as setas de voltar e avançar (ou **Ctrl/⌘+[** e **Ctrl/⌘+]**) para percorrê-lo. O breadcrumb mostra o caminho seguido, como `users › #42 Ana › orders (12)`; clique em uma etapa para voltar a ela. **Ctrl/⌘+Shift+[** e **]** trocam de aba, e **Ctrl/⌘+W** fecha uma.

Tudo o que você vê está no endereço: tabela, filtros, ordenação, página, registro aberto e filtro de relação. **Copiar link** coloca isso na área de transferência, e abrir o link em outro lugar reproduz a visão.
