---
title: Abas, trilha e links
description: Ande entre registros e tabelas, volte, mantenha várias visões abertas e compartilhe qualquer visão como link.
category: Dados
order: 3
related: [relationships, keyboard-shortcuts]
---

# Abas, trilha e links

O DbLocal guarda o seu lugar enquanto você anda pelos dados, então seguir uma relação nunca custa a visão de onde você veio.

## O painel de registro {#record-panel}

Clique no número de uma linha, ou pressione <kbd>Espaço</kbd> numa célula selecionada, para abrir o registro num painel lateral. Ele lista todos os campos, os pais a que o registro pertence e as relações das quais ele tem vários. Clique em qualquer um para seguir sem fechar o painel; a seta no cabeçalho volta um passo.

## Abas {#tabs}

Cada aba do workspace é uma tabela, um registro, uma query ou um diagrama, e cada uma guarda o próprio histórico.

- Clique numa tabela na barra lateral para abri-la; duplo clique, ou <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + clique num chip, a mantém numa aba própria.
- <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>[</kbd> e <kbd>]</kbd> trocam de aba; <kbd>Ctrl</kbd> + <kbd>W</kbd> fecha uma.
- Uma aba com alterações não salvas pergunta antes de fechar.

## Trilha e histórico {#trail}

O breadcrumb sob as abas mostra o caminho que você seguiu, como `users › #42 Ana › orders (12)`. Clique num passo para voltar a ele. As setas de voltar e avançar (ou <kbd>Ctrl</kbd> + <kbd>[</kbd> e <kbd>]</kbd>) percorrem o histórico da aba, e o botão Voltar do navegador faz o mesmo.

## Links diretos {#deep-links}

Tudo o que você vê está no endereço: a tabela, os filtros, a ordenação, a página, o registro aberto e o filtro de relação. **Copiar link** coloca o endereço na área de transferência, e abri-lo em outro lugar reproduz a visão.

> [!NOTE]
> O link só reproduz a visão, não os seus dados: quem o abrir precisa da mesma conexão salva na própria máquina.
