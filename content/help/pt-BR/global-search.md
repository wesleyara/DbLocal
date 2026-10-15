---
title: Buscar nos dados
description: Encontre um valor em qualquer tabela do schema e abra o registro ou a tabela filtrada.
category: Produtividade
order: 9
related: [productivity, data-grid]
---

# Buscar nos dados

Pressione <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> (<kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>F</kbd> no macOS), ou escolha **Buscar dados no schema** na paleta de comandos, para procurar um valor em todas as tabelas do schema atual.

## Contém e exato {#modes}

- **Contém** é uma busca por trecho, sem diferenciar maiúsculas, nas colunas de texto.
- **Exato** compara valores inteiros, incluindo colunas enum, uuid e numéricas.
- Números só são comparados com termos numéricos, e colunas uuid só com um uuid completo.

## Como ela roda {#how-it-runs}

A busca roda sob demanda, quatro tabelas por vez, e guarda no máximo 10 linhas por tabela, então um schema grande continua responsivo. Os resultados aparecem conforme cada tabela responde, agrupados por tabela.

> [!TIP]
> **Cancelar**, ou fechar o diálogo, interrompe as tabelas que ainda não começaram. As consultas que já estão rodando terminam sozinhas.

## Usando um resultado {#results}

Clique numa linha para abrir o registro. **Abrir tabela filtrada** abre o grid com um filtro OR que mostra todas as ocorrências nessa tabela.
